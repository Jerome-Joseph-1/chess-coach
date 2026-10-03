import { describe, expect, it } from 'vitest';
import type { Depth } from '../content/types';
import { flowReducer, initialState, scriptedUci, type FlowContext, type FlowEvent, type FlowState } from './flow';
import { promptFor, skipLabel, spotPromptFor } from './prompt';
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
const tap = (square: string): FlowEvent => ({ type: 'tap', square });
const move = (uci: string): FlowEvent => ({ type: 'move', uci });
const toFind: FlowEvent[] = [spot(true), advance];
const toSolve: FlowEvent[] = [...toFind, tap('d1'), advance];
const wrongMove = Object.keys(italian1.turns[TURN].grades).find((uci) => italian1.turns[TURN].grades[uci] >= 10)!;

describe('the spot step', () => {
  it('says what just happened until the user answers, then how it went', () => {
    expect(spotPromptFor(italian1, TURN, after(3, []))).toEqual({
      sub: 'Black just took back on e5. Take a look before you move.',
      right: false,
    });
    expect(spotPromptFor(italian1, TURN, after(3, [spot(true)]))).toEqual({ sub: 'Right.', right: true });
    expect(spotPromptFor(italian1, TURN, after(3, [spot(false)]))).toEqual({ sub: 'Not quite.', right: false });
  });
});

describe('the find step', () => {
  it('asks which piece matters most and says there are two tries', () => {
    expect(promptFor(italian1, after(3, toFind))).toEqual({
      title: 'Which piece matters most?',
      sub: 'Tap it on the board. You get two tries.',
      right: false,
    });
  });

  it('says not quite after a wrong tap and right after the right one', () => {
    expect(promptFor(italian1, after(3, [...toFind, tap('a1')])).sub).toBe('Not quite. Try again.');
    expect(promptFor(italian1, after(3, [...toFind, tap('d1')]))).toMatchObject({ sub: 'Right.', right: true });
  });
});

describe('the solve step', () => {
  it('asks for the move on the board', () => {
    expect(promptFor(italian1, after(3, toSolve))).toEqual({
      title: "What's your move?",
      sub: 'Play it on the board.',
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

  it('says not quite, with one more try after the first miss', () => {
    expect(promptFor(italian1, after(3, [...toSolve, move(wrongMove)])).sub).toBe('Not quite. One more try.');
    expect(promptFor(italian1, after(3, [...toSolve, move(wrongMove), move(wrongMove)])).sub).toBe('Not quite.');
  });
});

describe('the way out', () => {
  it('is "I\'m not sure" on the find step and "Show me the answer" on the play steps', () => {
    expect(skipLabel('find')).toBe("I'm not sure");
    expect(skipLabel('solve')).toBe('Show me the answer');
    expect(skipLabel('hold')).toBe('Show me the answer');
  });

  it('is left out where nothing can be skipped', () => {
    for (const phase of ['spot', 'reply', 'reveal', 'guided', 'done'] as const) expect(skipLabel(phase)).toBeNull();
  });
});
