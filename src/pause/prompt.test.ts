import { describe, expect, it } from 'vitest';
import type { Depth } from '../content/types';
import { lessonFor } from '../learn';
import type { Situation } from '../learn/situation';
import { whyWrong } from '../learn/whyWrong';
import { flowReducer, initialState, scriptedUci, type FlowContext, type FlowEvent, type FlowState } from './flow';
import { eyebrowFor, promptFor, spotPromptFor } from './prompt';
import { italian1 } from './testGames';

const TURN = 3;

function ctxAt(depth: Depth): FlowContext {
  return { game: italian1, turnIndex: TURN, depth, type: 'pause' };
}

function after(depth: Depth, events: FlowEvent[]): FlowState {
  const ctx = ctxAt(depth);
  return events.reduce((state, event) => flowReducer(ctx, state, event), initialState(ctx));
}

const advance: FlowEvent = { type: 'advance' };
const spot = (pick: Situation): FlowEvent => ({ type: 'spot', pick });
const move = (uci: string): FlowEvent => ({ type: 'move', uci });
const hint: FlowEvent = { type: 'hint' };
const toSolve: FlowEvent[] = [spot('win'), advance];
const wrongMove = Object.keys(italian1.turns[TURN].grades).find((uci) => italian1.turns[TURN].grades[uci] >= 10)!;

describe('the spot step', () => {
  it('says what just happened until the user answers, then what kind of position it is, never the move', () => {
    expect(spotPromptFor(ctxAt(3), after(3, []))).toEqual({ sub: 'Black just took back on e5.', tone: 'neutral' });
    expect(spotPromptFor(ctxAt(3), after(3, [spot('win')]))).toEqual({ sub: "Yes: there's material to win. Find the move.", tone: 'success' });
  });

  it('nudges a wrong pick towards what the position is really about', () => {
    expect(spotPromptFor(ctxAt(3), after(3, [spot('quiet')]))).toEqual({
      sub: 'Look again: check every capture and every attack.',
      tone: 'error',
    });
    expect(spotPromptFor(ctxAt(3), after(3, [spot('defend')])).sub).toBe('Is anything of yours actually attacked? Count the attackers.');
  });

  it('keeps the confirmation in view on the play step until the user moves', () => {
    expect(promptFor(italian1, after(3, toSolve))).toEqual({
      title: 'Your move',
      sub: "Yes: there's material to win. Find the move.",
      tone: 'neutral',
    });
  });
});

describe('the play step', () => {
  it('asks for the best move on the board when there was no step 1', () => {
    const drill: FlowContext = { ...ctxAt(3), mode: 'drill' };
    expect(promptFor(italian1, initialState(drill)).sub).toBe('Play the best move on the board.');
  });

  it('tells how few players at this level find a rare move', () => {
    const scripted = scriptedUci(italian1, TURN);
    const human = [{ uci: scripted, share: 0.18 }];
    const rare = { ...italian1, turns: italian1.turns.map((t, i) => (i === TURN ? { ...t, human } : t)) };
    const ctx: FlowContext = { ...ctxAt(3), game: rare };
    const play = [...toSolve, move(scriptedUci(rare, TURN))];
    const state = play.reduce((s, e) => flowReducer(ctx, s, e), initialState(ctx));
    expect(promptFor(rare, state)).toMatchObject({ sub: 'Only 18% of players rated 1400 find this.', tone: 'success' });
  });

  it('says right when most players find the move', () => {
    const play = [...toSolve, move(scriptedUci(italian1, TURN))];
    expect(promptFor(italian1, after(3, play))).toMatchObject({ sub: 'Right.', tone: 'success' });
  });

  it('says why each wrong move is wrong', () => {
    const why = whyWrong(italian1, TURN, wrongMove, 0).text;
    expect(why).not.toBe('Not quite. Try again.');
    expect(promptFor(italian1, after(3, [...toSolve, move(wrongMove)]))).toMatchObject({ sub: why, tone: 'error' });
    expect(promptFor(italian1, after(3, [...toSolve, move(wrongMove), move(wrongMove), move(wrongMove)])).sub).toBe(why);
  });

  it('names the pattern first, then the piece in trouble, then asks for the move shown', () => {
    const pattern = lessonFor(italian1, TURN).hint;
    expect(promptFor(italian1, after(3, [...toSolve, hint]))).toEqual({ title: pattern, sub: 'Play the best move on the board.', tone: 'hint' });
    expect(promptFor(italian1, after(3, [...toSolve, hint, hint]))).toEqual({ title: pattern, sub: "It's Black's knight on c6.", tone: 'hint' });
    expect(promptFor(italian1, after(3, [...toSolve, hint, hint, hint])).sub).toBe("It's Black's knight on c6. Play the move shown.");
  });

  it('keeps the drawn move in view after a wrong move, and does not boast of a rare find after a hint', () => {
    expect(promptFor(italian1, after(3, [...toSolve, hint, hint, hint, move(wrongMove)]))).toMatchObject({
      sub: "It's Black's knight on c6. Play the move shown.",
      tone: 'error',
    });
    expect(promptFor(italian1, after(3, [...toSolve, hint, hint, move(wrongMove)])).sub).toBe(whyWrong(italian1, TURN, wrongMove, 2).text);
    expect(promptFor(italian1, after(3, [...toSolve, hint, move(scriptedUci(italian1, TURN))])).sub).toBe('Right.');
  });

  it('lets the next hint take the place of the explanation', () => {
    expect(promptFor(italian1, after(3, [...toSolve, move(wrongMove), hint]))).toMatchObject({
      sub: 'Play the best move on the board.',
      tone: 'hint',
    });
  });

  it('asks to keep going on a follow-up move', () => {
    const state = after(5, [...toSolve, move(scriptedUci(italian1, TURN)), advance, { type: 'replied' }]);
    expect(promptFor(italian1, state)).toMatchObject({ title: 'Keep going', sub: "Black has answered. What's your next move?" });
    expect(promptFor(italian1, flowReducer(ctxAt(5), state, hint))).toMatchObject({ title: 'Keep going', sub: 'Move the highlighted piece.' });
  });
});

describe('the eyebrow', () => {
  it('names the key position by its move number', () => {
    expect(eyebrowFor(italian1, TURN)).toBe(`Key position · Move ${italian1.turns[TURN].moveNo}`);
  });
});
