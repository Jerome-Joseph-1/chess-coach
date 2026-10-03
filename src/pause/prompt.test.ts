import { describe, expect, it } from 'vitest';
import type { Depth } from '../content/types';
import { flowReducer, initialState, scriptedUci, type FlowContext, type FlowEvent, type FlowState } from './flow';
import { lessonFor } from '../learn';
import { hintLabel, promptFor, spotPromptFor } from './prompt';
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
const spot = (up: boolean): FlowEvent => ({ type: 'spot', up });
const move = (uci: string): FlowEvent => ({ type: 'move', uci });
const hint: FlowEvent = { type: 'hint' };
const toSolve: FlowEvent[] = [spot(true), advance];
const wrongMove = Object.keys(italian1.turns[TURN].grades).find((uci) => italian1.turns[TURN].grades[uci] >= 10)!;

describe('the spot step', () => {
  it('says what just happened until the user answers, then how it went', () => {
    expect(spotPromptFor(italian1, TURN, after(3, []))).toEqual({
      sub: 'Black just took back on e5. Take a look before you move.',
      right: false,
    });
    expect(spotPromptFor(italian1, TURN, after(3, [spot(true)]))).toEqual({ sub: 'Right.', right: true });
  });

  it('asks to look again after a wrong answer', () => {
    expect(spotPromptFor(italian1, TURN, after(3, [spot(false)]))).toEqual({ sub: 'Not quite. Look again.', right: false });
  });
});

describe('the play step', () => {
  it.each([1, 2, 3, 4, 5] as const)('asks for the best move on the board at stage %i', (depth) => {
    expect(promptFor(italian1, after(depth, toSolve))).toEqual({
      title: 'Your move',
      sub: 'Play the best move on the board.',
      right: false,
    });
  });

  it('tells how few players at this level find a rare move', () => {
    const scripted = scriptedUci(italian1, TURN);
    const human = [{ uci: scripted, share: 0.18 }];
    const rare = { ...italian1, turns: italian1.turns.map((t, i) => (i === TURN ? { ...t, human } : t)) };
    const ctx: FlowContext = { ...ctxAt(3), game: rare };
    const play = [...toSolve, move(scriptedUci(rare, TURN))];
    const state = play.reduce((s, e) => flowReducer(ctx, s, e), initialState(ctx));
    expect(promptFor(rare, state)).toMatchObject({ sub: 'Only 18% of players rated 1400 find this.', right: true });
  });

  it('says right when most players find the move', () => {
    const play = [...toSolve, move(scriptedUci(italian1, TURN))];
    expect(promptFor(italian1, after(3, play))).toMatchObject({ sub: 'Right.', right: true });
  });

  it('says to try again after every wrong move', () => {
    expect(promptFor(italian1, after(3, [...toSolve, move(wrongMove)])).sub).toBe('Not quite. Try again.');
    expect(promptFor(italian1, after(3, [...toSolve, move(wrongMove), move(wrongMove), move(wrongMove)])).sub).toBe(
      'Not quite. Try again.',
    );
  });

  it('names the pattern first, then asks to move the marked piece, then to play the move shown', () => {
    expect(promptFor(italian1, after(3, [...toSolve, hint])).sub).toBe(lessonFor(italian1, TURN).hint);
    expect(promptFor(italian1, after(3, [...toSolve, hint, hint])).sub).toBe('Move the highlighted piece.');
    expect(promptFor(italian1, after(3, [...toSolve, hint, hint, hint])).sub).toBe('Play the move shown.');
  });

  it('keeps the hint in view after a wrong move, and does not boast of a rare find after a hint', () => {
    expect(promptFor(italian1, after(3, [...toSolve, hint, hint, move(wrongMove)])).sub).toBe('Move the highlighted piece.');
    expect(promptFor(italian1, after(3, [...toSolve, hint, move(scriptedUci(italian1, TURN))])).sub).toBe('Right.');
  });

  it('asks to keep going on a follow-up move', () => {
    const state = after(5, [...toSolve, move(scriptedUci(italian1, TURN)), advance, { type: 'replied' }]);
    expect(promptFor(italian1, state)).toMatchObject({ title: 'Keep going', sub: "Black has answered. What's your next move?" });
  });
});

describe('the hint button', () => {
  it('is Hint, Show the piece, Show the move, then gone on the play steps', () => {
    expect(hintLabel(after(3, toSolve))).toBe('Hint');
    expect(hintLabel(after(3, [...toSolve, hint]))).toBe('Show the piece');
    expect(hintLabel(after(3, [...toSolve, hint, hint]))).toBe('Show the move');
    expect(hintLabel(after(3, [...toSolve, hint, hint, hint]))).toBeNull();
  });

  it('is left out where nothing is played', () => {
    expect(hintLabel(after(3, []))).toBeNull();
    expect(hintLabel(after(3, [spot(true)]))).toBeNull();
    expect(hintLabel(after(3, [...toSolve, { type: 'solution' }]))).toBeNull();
  });
});
