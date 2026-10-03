import { describe, expect, it } from 'vitest';
import type { Depth, Game } from '../content/types';
import {
  BLUNDER_MIN,
  HOLD_MAX,
  finalFen,
  flowReducer,
  flowResult,
  holdTurns,
  initialState,
  plannedSteps,
  revealTurn,
  scriptedUci,
  stars,
  stepNumber,
  stepTotal,
  type FlowContext,
  type FlowEvent,
  type FlowState,
} from './flow';
import { fenAfter, samePosition, uciOfSan } from './position';
import { italian1, italian2 } from './testGames';

const DEPTHS: Depth[] = [1, 2, 3, 4, 5];

function ctxFor(game: Game, turnIndex: number, depth: Depth, type: 'pause' | 'nothing' = 'pause'): FlowContext {
  return { game, turnIndex, depth, type };
}

function run(ctx: FlowContext, events: FlowEvent[], from: FlowState = initialState(ctx)): FlowState {
  return events.reduce((state, event) => flowReducer(ctx, state, event), from);
}

const advance: FlowEvent = { type: 'advance' };
const replied: FlowEvent = { type: 'replied' };
const move = (uci: string): FlowEvent => ({ type: 'move', uci });
const spot = (up: boolean): FlowEvent => ({ type: 'spot', up });
const tap = (square: string): FlowEvent => ({ type: 'tap', square });

/** A move at this turn that loses at least `min` win%. */
function losingMove(game: Game, turnIndex: number, min = BLUNDER_MIN): string {
  const grades = game.turns[turnIndex].grades;
  return Object.keys(grades).find((uci) => grades[uci] >= min)!;
}

/** A fine move at this turn that is not the scripted one. */
function otherHoldingMove(game: Game, turnIndex: number): string {
  const { grades } = game.turns[turnIndex];
  const scripted = scriptedUci(game, turnIndex);
  return Object.keys(grades).find((uci) => uci !== scripted && grades[uci] <= HOLD_MAX)!;
}

/** Events for a pause answered perfectly at the given depth, ending on the reveal. */
function perfectRun(ctx: FlowContext): FlowEvent[] {
  const { game, turnIndex, depth } = ctx;
  const events: FlowEvent[] = [spot(true), advance];
  if (depth >= 2) events.push(tap(game.turns[turnIndex].keySquares[0]), advance);
  const asked = depth >= 3 ? [turnIndex, ...holdTurns(ctx)] : [];
  asked.forEach((turn, i) => {
    events.push(move(scriptedUci(game, turn)), advance);
    if (i < asked.length - 1) events.push(replied);
  });
  return events;
}

describe('content the flow relies on', () => {
  it('has a legal scripted move at every turn, and the reply leads to the next turn', () => {
    for (const game of [italian1, italian2]) {
      game.turns.forEach((turn, i) => {
        const scripted = scriptedUci(game, i);
        expect(scripted, `${game.id} turn ${i}`).not.toBe('');
        const next = game.turns[i + 1];
        if (!next) return;
        const afterScripted = fenAfter(turn.fen, [scripted]);
        const reply = uciOfSan(afterScripted, game.moves[turn.ply + 1]);
        expect(samePosition(fenAfter(afterScripted, [reply]), next.fen), `${game.id} turn ${i}`).toBe(true);
      });
    }
  });
});

describe('holdTurns and plannedSteps', () => {
  it('asks no hold move up to depth 3, one at depth 4 and up to five at depth 5', () => {
    expect(holdTurns(ctxFor(italian1, 3, 3))).toEqual([]);
    expect(holdTurns(ctxFor(italian1, 3, 4))).toEqual([4]);
    expect(holdTurns(ctxFor(italian1, 3, 5))).toEqual([4, 5, 6, 7, 8]);
  });

  it('ends the depth 5 play-out before a quiet turn', () => {
    expect(holdTurns(ctxFor(italian1, 9, 5))).toEqual([10]);
    expect(holdTurns(ctxFor(italian2, 17, 5))).toEqual([]);
  });

  it('still asks the one move of depth 4 when the next turn is quiet', () => {
    expect(holdTurns(ctxFor(italian2, 17, 4))).toEqual([18]);
  });

  it('stops at the last turn of the game', () => {
    expect(holdTurns(ctxFor(italian1, 26, 5))).toEqual([]);
  });

  it('lists the steps each depth asks', () => {
    expect(plannedSteps(ctxFor(italian1, 3, 1))).toEqual(['spot']);
    expect(plannedSteps(ctxFor(italian1, 3, 2))).toEqual(['spot', 'find']);
    expect(plannedSteps(ctxFor(italian1, 3, 3))).toEqual(['spot', 'find', 'solve']);
    expect(plannedSteps(ctxFor(italian1, 3, 4))).toEqual(['spot', 'find', 'solve', 'hold']);
    expect(plannedSteps(ctxFor(italian1, 3, 5))).toEqual(['spot', 'find', 'solve', 'hold', 'hold', 'hold', 'hold', 'hold']);
    expect(plannedSteps(ctxFor(italian1, 11, 5, 'nothing'))).toEqual(['spot']);
  });
});

describe('the step header', () => {
  it('counts the steps this depth asks: 1, 2, then 3 from depth 3 on', () => {
    const totals = DEPTHS.map((depth) => stepTotal(ctxFor(italian1, 3, depth)));
    expect(totals).toEqual([1, 2, 3, 3, 3]);
  });

  it('counts one step for a quiet position at any depth', () => {
    for (const depth of DEPTHS) expect(stepTotal(ctxFor(italian1, 11, depth, 'nothing'))).toBe(1);
  });

  it('numbers the phases that ask something and leaves the rest unnumbered', () => {
    expect(stepNumber('spot')).toBe(1);
    expect(stepNumber('find')).toBe(2);
    expect(['solve', 'hold', 'reply'].map((phase) => stepNumber(phase as never))).toEqual([3, 3, 3]);
    expect(['reveal', 'guided', 'done'].map((phase) => stepNumber(phase as never))).toEqual([null, null, null]);
  });
});

describe('a perfect pause', () => {
  it.each(DEPTHS)('depth %i records every asked step and resumes after the last scripted move', (depth) => {
    for (const [game, turnIndex] of [[italian1, 3], [italian1, 9], [italian2, 1]] as const) {
      const ctx = ctxFor(game, turnIndex, depth);
      const state = run(ctx, perfectRun(ctx));
      const planned = plannedSteps(ctx);
      expect(state.phase).toBe('reveal');
      expect(state.recorded).toEqual(planned.map((step) => ({ step, correct: true })));
      expect(stars(state.outcomes)).toBe(planned.length);

      const lastTurn = depth >= 3 ? (holdTurns(ctx).at(-1) ?? turnIndex) : turnIndex;
      const last = game.turns[lastTurn];
      if (depth >= 3) {
        expect(state.scriptedDone).toBe(true);
        const done = run(ctx, [{ type: 'continue' }], state);
        expect(done.phase).toBe('done');
        expect(flowResult(ctx, done).resumePly).toBe(last.ply + 1);
        expect(finalFen(ctx, done)).toBe(fenAfter(last.fen, [scriptedUci(game, lastTurn)]));
      } else {
        const guided = run(ctx, [{ type: 'continue' }], state);
        expect(guided.phase).toBe('guided');
        expect(guided.turn).toBe(turnIndex);
        const done = run(ctx, [move(scriptedUci(game, turnIndex)), advance], guided);
        expect(done.phase).toBe('done');
        expect(flowResult(ctx, done).resumePly).toBe(game.turns[turnIndex].ply + 1);
      }
    }
  });

  it('follows the opponent reply between hold moves', () => {
    const ctx = ctxFor(italian1, 3, 5);
    const afterSolve = run(ctx, [spot(true), advance, tap('d1'), advance, move(scriptedUci(italian1, 3)), advance]);
    expect(afterSolve.phase).toBe('reply');
    const asked = run(ctx, [replied], afterSolve);
    expect(asked.phase).toBe('hold');
    expect(asked.turn).toBe(4);
    expect(asked.scriptedDone).toBe(false);
  });
});

describe('a quiet turn', () => {
  it.each(DEPTHS)('depth %i asks only the spot and resumes at the turn itself', (depth) => {
    const ctx = ctxFor(italian1, 11, depth, 'nothing');
    const state = run(ctx, [spot(false), advance]);
    expect(state.phase).toBe('reveal');
    expect(state.recorded).toEqual([{ step: 'spot', correct: true }]);
    const done = run(ctx, [{ type: 'continue' }], state);
    expect(done.phase).toBe('done');
    expect(flowResult(ctx, done)).toEqual({
      outcomes: [{ step: 'spot', correct: true }],
      resumePly: italian1.turns[11].ply,
    });
    expect(finalFen(ctx, done)).toBe(italian1.turns[11].fen);
  });

  it('counts "Something\'s up" as a miss', () => {
    const ctx = ctxFor(italian1, 11, 3, 'nothing');
    const state = run(ctx, [spot(true), advance]);
    expect(state.recorded).toEqual([{ step: 'spot', correct: false }]);
  });

  it('has no try again', () => {
    const ctx = ctxFor(italian1, 11, 1, 'nothing');
    const state = run(ctx, [spot(false), advance, { type: 'retry' }]);
    expect(state.phase).toBe('reveal');
  });
});

describe('the spot step', () => {
  it.each(DEPTHS)('depth %i: a wrong answer skips to the reveal and records the rest as missed', (depth) => {
    const ctx = ctxFor(italian1, 3, depth);
    const state = run(ctx, [spot(false), advance]);
    expect(state.phase).toBe('reveal');
    expect(state.recorded).toEqual(plannedSteps(ctx).map((step) => ({ step, correct: false })));
    expect(revealTurn(ctx, state)).toBe(3);

    const guided = run(ctx, [{ type: 'continue' }], state);
    expect(guided.phase).toBe('guided');
    const done = run(ctx, [move(scriptedUci(italian1, 3)), advance], guided);
    expect(flowResult(ctx, done).resumePly).toBe(italian1.turns[3].ply + 1);
  });

  it('holds the answer on screen until advance', () => {
    const ctx = ctxFor(italian1, 3, 3);
    const answered = run(ctx, [spot(true)]);
    expect(answered.phase).toBe('spot');
    expect(answered.answered).toBe(true);
    expect(answered.feedback).toEqual({ kind: 'spot', correct: true });
    expect(run(ctx, [spot(false)], answered)).toBe(answered);
  });
});

describe('the find step', () => {
  const ctx = ctxFor(italian1, 3, 3);
  const toFind = () => run(ctx, [spot(true), advance]);

  it('accepts any key square', () => {
    for (const square of italian1.turns[3].keySquares) {
      const state = run(ctx, [tap(square)], toFind());
      expect(state.feedback).toEqual({ kind: 'find', correct: true, square });
      expect(state.next).toBe('solve');
    }
  });

  it('gives a second try after the first wrong tap', () => {
    const state = run(ctx, [tap('a1')], toFind());
    expect(state.phase).toBe('find');
    expect(state.answered).toBe(false);
    expect(state.tries).toBe(1);
    expect(state.feedback).toEqual({ kind: 'find', correct: false, square: 'a1' });
  });

  it('shows the hint after two misses and moves on, recording a miss', () => {
    const state = run(ctx, [tap('a1'), tap('a2')], toFind());
    expect(state.feedback).toEqual({ kind: 'hint' });
    expect(state.answered).toBe(true);
    expect(state.outcomes.at(-1)).toEqual({ step: 'find', correct: false });
    const next = run(ctx, [advance], state);
    expect(next.phase).toBe('solve');
    expect(next.tries).toBe(0);
  });

  it('goes to the reveal after find at depth 2', () => {
    const shallow = ctxFor(italian1, 3, 2);
    const state = run(shallow, [spot(true), advance, tap('d1'), advance]);
    expect(state.phase).toBe('reveal');
    expect(state.recorded).toEqual([
      { step: 'spot', correct: true },
      { step: 'find', correct: true },
    ]);
  });
});

describe('giving up', () => {
  const ctx = ctxFor(italian1, 3, 3);
  const toFind = () => run(ctx, [spot(true), advance]);
  const toSolve = () => run(ctx, [spot(true), advance, tap('d1'), advance]);
  const skip: FlowEvent = { type: 'skip' };

  it('goes straight from "I\'m not sure" to the reveal, counting the rest as missed', () => {
    const state = run(ctx, [skip], toFind());
    expect(state.phase).toBe('reveal');
    expect(state.answered).toBe(false);
    expect(state.recorded).toEqual([
      { step: 'spot', correct: true },
      { step: 'find', correct: false },
      { step: 'solve', correct: false },
    ]);
  });

  it('goes from "Show me the answer" to the reveal of the pause turn', () => {
    const state = run(ctx, [skip], toSolve());
    expect(state.phase).toBe('reveal');
    expect(state.recorded).toEqual([
      { step: 'spot', correct: true },
      { step: 'find', correct: true },
      { step: 'solve', correct: false },
    ]);
    expect(revealTurn(ctx, state)).toBe(3);
  });

  it('shows the lines of the later turn when given up in the play-out', () => {
    const deep = ctxFor(italian1, 3, 5);
    const toHold = run(deep, [spot(true), advance, tap('d1'), advance, move(scriptedUci(italian1, 3)), advance, replied]);
    expect(toHold.phase).toBe('hold');
    const state = run(deep, [skip], toHold);
    expect(state.phase).toBe('reveal');
    expect(revealTurn(deep, state)).toBe(4);
    expect(state.recorded).toHaveLength(plannedSteps(deep).length);
    expect(state.recorded!.slice(0, 3).map((o) => o.correct)).toEqual([true, true, true]);
    expect(state.recorded!.slice(3).every((o) => !o.correct)).toBe(true);
  });

  it('leaves the guided move to play after the reveal, and ignores skip anywhere else', () => {
    const state = run(ctx, [skip, { type: 'continue' }], toSolve());
    expect(state.phase).toBe('guided');
    expect(run(ctx, [skip], initialState(ctx)).phase).toBe('spot');
    const answered = run(ctx, [tap('d1')], toFind());
    expect(run(ctx, [skip], answered)).toBe(answered);
  });

  it('keeps the first attempt when the user tries again and gives up again', () => {
    const state = run(ctx, [skip, { type: 'retry' }, spot(true), advance, skip], toFind());
    expect(state.attempt).toBe(1);
    expect(state.recorded!.map((o) => o.correct)).toEqual([true, false, false]);
  });
});

describe('the picked piece', () => {
  it('is remembered after the right tap and forgotten on a new attempt', () => {
    const ctx = ctxFor(italian1, 3, 3);
    const square = italian1.turns[3].keySquares[0];
    const state = run(ctx, [spot(true), advance, tap(square)]);
    expect(state.picked).toBe(square);
    expect(run(ctx, [tap('a1')], run(ctx, [spot(true), advance])).picked).toBeNull();
  });
});

describe('the solve step', () => {
  const ctx = ctxFor(italian1, 3, 3);
  const toSolve = () => run(ctx, [spot(true), advance, tap('d1'), advance]);

  it('celebrates the scripted move', () => {
    const uci = scriptedUci(italian1, 3);
    const state = run(ctx, [move(uci)], toSolve());
    expect(state.feedback).toEqual({ kind: 'move', uci, turn: 3 });
    expect(state.scriptedDone).toBe(true);
    expect(state.alt).toBe(false);
  });

  it('gives one more try, then goes to the reveal with the losing move recorded', () => {
    const wrong = losingMove(italian1, 3);
    const retry = run(ctx, [move(wrong)], toSolve());
    expect(retry.phase).toBe('solve');
    expect(retry.tries).toBe(1);
    expect(retry.feedback).toEqual({ kind: 'wrong', uci: wrong });

    const failed = run(ctx, [move(wrong), advance], retry);
    expect(failed.phase).toBe('reveal');
    expect(failed.missedUci).toBe(wrong);
    expect(failed.recorded).toEqual([
      { step: 'spot', correct: true },
      { step: 'find', correct: true },
      { step: 'solve', correct: false },
    ]);
    expect(failed.scriptedDone).toBe(false);
  });

  it('lets a right second try through', () => {
    const wrong = losingMove(italian1, 3);
    const state = run(ctx, [move(wrong), move(scriptedUci(italian1, 3)), advance], toSolve());
    expect(state.phase).toBe('reveal');
    expect(state.outcomes.at(-1)).toEqual({ step: 'solve', correct: true });
  });

  it('treats a move the script cannot follow as correct but ends the play-out', () => {
    const deep = ctxFor(italian1, 3, 5);
    const alt = otherHoldingMove(italian1, 3);
    const state = run(deep, [spot(true), advance, tap('d1'), advance, move(alt), advance]);
    expect(state.phase).toBe('reveal');
    expect(state.alt).toBe(true);
    expect(state.recorded).toEqual([
      { step: 'spot', correct: true },
      { step: 'find', correct: true },
      { step: 'solve', correct: true },
    ]);
    expect(state.feedback).toBeNull();

    const done = run(deep, [{ type: 'continue' }], state);
    expect(done.phase).toBe('done');
    expect(flowResult(deep, done).resumePly).toBe(italian1.turns[3].ply + 1);
    expect(finalFen(deep, done)).toBe(fenAfter(italian1.turns[3].fen, [scriptedUci(italian1, 3)]));
  });

  it('marks an alternative as such in the feedback', () => {
    const alt = otherHoldingMove(italian1, 3);
    expect(run(ctx, [move(alt)], toSolve()).feedback).toEqual({ kind: 'alt', uci: alt });
  });

  it('ignores moves while the answer is on screen', () => {
    const answered = run(ctx, [move(scriptedUci(italian1, 3))], toSolve());
    expect(run(ctx, [move(losingMove(italian1, 3))], answered)).toBe(answered);
  });
});

describe('the hold steps', () => {
  const ctx = ctxFor(italian1, 3, 5);
  const toFirstHold = () =>
    run(ctx, [spot(true), advance, tap('d1'), advance, move(scriptedUci(italian1, 3)), advance, replied]);

  it('grades the next turn with its own grades', () => {
    const state = toFirstHold();
    expect(state.phase).toBe('hold');
    const uci = scriptedUci(italian1, 4);
    expect(run(ctx, [move(uci)], state).feedback).toEqual({ kind: 'move', uci, turn: 4 });
  });

  it('accepts a scripted move even when its grade is above the hold limit', () => {
    const state = run(ctx, [spot(true), advance, tap('d1'), advance, move(scriptedUci(italian1, 3)), advance, replied, move(scriptedUci(italian1, 4)), advance, replied]);
    expect(state.turn).toBe(5);
    const uci = scriptedUci(italian1, 5);
    expect(italian1.turns[5].grades[uci]).toBeGreaterThan(HOLD_MAX);
    expect(run(ctx, [move(uci)], state).feedback).toEqual({ kind: 'move', uci, turn: 5 });
  });

  it('ends the play-out at once on a move losing 10 or more, and shows its refutation', () => {
    const wrong = losingMove(italian1, 4);
    const state = run(ctx, [move(wrong), advance], toFirstHold());
    expect(state.phase).toBe('reveal');
    expect(state.missedUci).toBe(wrong);
    expect(revealTurn(ctx, state)).toBe(4);
    expect(state.recorded).toEqual([
      { step: 'spot', correct: true },
      { step: 'find', correct: true },
      { step: 'solve', correct: true },
      ...Array.from({ length: 5 }, () => ({ step: 'hold', correct: false })),
    ]);

    const guided = run(ctx, [{ type: 'continue' }], state);
    expect(guided.phase).toBe('guided');
    expect(guided.turn).toBe(4);
    const done = run(ctx, [move(scriptedUci(italian1, 4)), advance], guided);
    expect(flowResult(ctx, done).resumePly).toBe(italian1.turns[4].ply + 1);
  });

  it('gives a retry for a smaller slip', () => {
    const turns = italian1.turns.map((t, i) => (i === 4 ? { ...t, grades: { ...t.grades, h2h3: 5 } } : t));
    const slipCtx = { ...ctx, game: { ...italian1, turns } };
    const state = run(slipCtx, [move('h2h3')], run(slipCtx, [spot(true), advance, tap('d1'), advance, move(scriptedUci(italian1, 3)), advance, replied]));
    expect(state.phase).toBe('hold');
    expect(state.tries).toBe(1);
    expect(run(slipCtx, [move('h2h3'), advance], state).phase).toBe('reveal');
  });

  it('stops the play-out at an alternative move and resumes after the script move of that turn', () => {
    const alt = otherHoldingMove(italian1, 4);
    const state = run(ctx, [move(alt), advance], toFirstHold());
    expect(state.alt).toBe(true);
    const done = run(ctx, [{ type: 'continue' }], state);
    expect(done.phase).toBe('done');
    expect(flowResult(ctx, done).resumePly).toBe(italian1.turns[4].ply + 1);
  });
});

describe('try again', () => {
  it('starts over at the pause but keeps the first attempt as the record', () => {
    const ctx = ctxFor(italian1, 3, 3);
    const failed = run(ctx, [spot(false), advance]);
    const again = run(ctx, [{ type: 'retry' }], failed);
    expect(again.phase).toBe('spot');
    expect(again.turn).toBe(3);
    expect(again.attempt).toBe(1);
    expect(again.outcomes).toEqual([]);

    const second = run(ctx, perfectRun(ctx), again);
    expect(second.phase).toBe('reveal');
    expect(stars(second.outcomes)).toBe(3);
    expect(second.recorded).toEqual(failed.recorded);
    expect(flowResult(ctx, run(ctx, [{ type: 'continue' }], second)).outcomes).toEqual(failed.recorded);
  });

  it('only works from the reveal', () => {
    const ctx = ctxFor(italian1, 3, 3);
    const state = run(ctx, [spot(true)]);
    expect(run(ctx, [{ type: 'retry' }], state)).toBe(state);
  });

  it('starts over at the pause turn after a miss deep in the play-out', () => {
    const ctx = ctxFor(italian1, 3, 5);
    const state = run(ctx, [spot(true), advance, tap('d1'), advance, move(scriptedUci(italian1, 3)), advance, replied, move(losingMove(italian1, 4)), advance]);
    const again = run(ctx, [{ type: 'retry' }], state);
    expect(again.turn).toBe(3);
    expect(again.missedUci).toBeNull();
  });
});

describe('guided move', () => {
  const ctx = ctxFor(italian1, 3, 1);
  const guided = () => run(ctx, [spot(true), advance, { type: 'continue' }]);

  it('only accepts the scripted move', () => {
    const wrong = losingMove(italian1, 3);
    const state = run(ctx, [move(wrong)], guided());
    expect(state.phase).toBe('guided');
    expect(state.feedback).toEqual({ kind: 'gentle' });
    expect(state.answered).toBe(false);
  });

  it('finishes once the scripted move is played', () => {
    const uci = scriptedUci(italian1, 3);
    const state = run(ctx, [move(uci)], guided());
    expect(state.feedback).toEqual({ kind: 'guided', uci });
    expect(run(ctx, [advance], state).phase).toBe('done');
  });
});
