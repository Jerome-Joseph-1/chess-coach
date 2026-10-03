import { describe, expect, it } from 'vitest';
import type { Depth, Game } from '../content/types';
import {
  BLUNDER_MIN,
  HOLD_MAX,
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
const hint: FlowEvent = { type: 'hint' };
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
    expect(['reveal', 'done'].map((phase) => stepNumber(phase as never))).toEqual([null, null]);
  });
});

describe('a perfect pause', () => {
  it.each(DEPTHS)('depth %i records every asked step and resumes at the scripted move of the pause', (depth) => {
    for (const [game, turnIndex] of [[italian1, 3], [italian1, 9], [italian2, 1]] as const) {
      const ctx = ctxFor(game, turnIndex, depth);
      const state = run(ctx, perfectRun(ctx));
      const planned = plannedSteps(ctx);
      expect(state.phase).toBe('reveal');
      expect(state.outcomes).toEqual(planned.map((step) => ({ step, correct: true })));
      expect(stars(state.outcomes)).toBe(planned.length);
      expect(state.hinted).toBe(false);

      const done = run(ctx, [{ type: 'continue' }], state);
      expect(done.phase).toBe('done');
      expect(flowResult(ctx, done).resumePly).toBe(game.turns[turnIndex].ply);
    }
  });

  it('follows the opponent reply between hold moves', () => {
    const ctx = ctxFor(italian1, 3, 5);
    const afterSolve = run(ctx, [spot(true), advance, tap('d1'), advance, move(scriptedUci(italian1, 3)), advance]);
    expect(afterSolve.phase).toBe('reply');
    const asked = run(ctx, [replied], afterSolve);
    expect(asked.phase).toBe('hold');
    expect(asked.turn).toBe(4);
  });
});

describe('a quiet turn', () => {
  it.each(DEPTHS)('depth %i asks only the spot and resumes at the turn itself', (depth) => {
    const ctx = ctxFor(italian1, 11, depth, 'nothing');
    const state = run(ctx, [spot(false), advance]);
    expect(state.phase).toBe('reveal');
    expect(state.outcomes).toEqual([{ step: 'spot', correct: true }]);
    const done = run(ctx, [{ type: 'continue' }], state);
    expect(done.phase).toBe('done');
    expect(flowResult(ctx, done)).toEqual({
      outcomes: [{ step: 'spot', correct: true }],
      resumePly: italian1.turns[11].ply,
    });
  });

  it('counts "Something\'s up" as a miss', () => {
    const ctx = ctxFor(italian1, 11, 3, 'nothing');
    const state = run(ctx, [spot(true), advance]);
    expect(state.outcomes).toEqual([{ step: 'spot', correct: false }]);
  });
});

describe('the spot step', () => {
  it.each(DEPTHS)('depth %i: a wrong answer skips to the reveal and records the rest as missed', (depth) => {
    const ctx = ctxFor(italian1, 3, depth);
    const state = run(ctx, [spot(false), advance]);
    expect(state.phase).toBe('reveal');
    expect(state.outcomes).toEqual(plannedSteps(ctx).map((step) => ({ step, correct: false })));
    expect(state.hinted).toBe(false);
    expect(revealTurn(ctx, state)).toBe(3);

    const done = run(ctx, [{ type: 'continue' }], state);
    expect(done.phase).toBe('done');
    expect(flowResult(ctx, done).resumePly).toBe(italian1.turns[3].ply);
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
      expect(state.outcomes.at(-1)).toEqual({ step: 'find', correct: true });
    }
  });

  it('gives a second try after the first wrong tap, and a right second tap still counts', () => {
    const state = run(ctx, [tap('a1')], toFind());
    expect(state.phase).toBe('find');
    expect(state.answered).toBe(false);
    expect(state.tries).toBe(1);
    expect(state.hint).toBe(0);
    expect(state.feedback).toEqual({ kind: 'find', correct: false, square: 'a1' });
    expect(run(ctx, [tap('d1')], state).outcomes.at(-1)).toEqual({ step: 'find', correct: true });
  });

  it('marks the piece after two wrong taps and waits for the user to tap it', () => {
    const state = run(ctx, [tap('a1'), tap('a2')], toFind());
    expect(state.hint).toBe(1);
    expect(state.hinted).toBe(true);
    expect(state.answered).toBe(false);
    expect(state.phase).toBe('find');

    const found = run(ctx, [tap('d1')], state);
    expect(found.outcomes.at(-1)).toEqual({ step: 'find', correct: false });
    expect(found.next).toBe('solve');
    expect(run(ctx, [advance], found)).toMatchObject({ phase: 'solve', tries: 0, hint: 0, picked: 'd1' });
  });

  it('marks the piece on request, and counts it as not found', () => {
    const state = run(ctx, [hint], toFind());
    expect(state.hint).toBe(1);
    expect(state.hinted).toBe(true);
    expect(run(ctx, [hint], state)).toBe(state);
    expect(run(ctx, [tap('d1')], state).outcomes.at(-1)).toEqual({ step: 'find', correct: false });
  });

  it('keeps asking for the piece after the hint when the user taps elsewhere', () => {
    const state = run(ctx, [hint, tap('a1'), tap('a2'), tap('a3')], toFind());
    expect(state.phase).toBe('find');
    expect(state.answered).toBe(false);
    expect(state.hint).toBe(1);
  });

  it('goes to the reveal after find at depth 2', () => {
    const shallow = ctxFor(italian1, 3, 2);
    const state = run(shallow, [spot(true), advance, tap('d1'), advance]);
    expect(state.phase).toBe('reveal');
    expect(state.outcomes).toEqual([
      { step: 'spot', correct: true },
      { step: 'find', correct: true },
    ]);
  });
});

describe('hints', () => {
  const ctx = ctxFor(italian1, 3, 3);
  const toSolve = () => run(ctx, [spot(true), advance, tap('d1'), advance]);
  const wrong = losingMove(italian1, 3);
  const scripted = scriptedUci(italian1, 3);

  it('walks from the piece to the move and stops there', () => {
    const first = run(ctx, [hint], toSolve());
    expect(first.hint).toBe(1);
    const second = run(ctx, [hint], first);
    expect(second.hint).toBe(2);
    expect(run(ctx, [hint], second)).toBe(second);
  });

  it('counts a hinted answer as not correct, and says the pause was solved with a hint', () => {
    const state = run(ctx, [hint, move(scripted)], toSolve());
    expect(state.outcomes.at(-1)).toEqual({ step: 'solve', correct: false });
    expect(state.hinted).toBe(true);
    expect(state.next).toBe('reveal');
  });

  it('comes by itself after the second wrong move, and again after the third', () => {
    const one = run(ctx, [move(wrong)], toSolve());
    expect([one.tries, one.hint, one.hinted]).toEqual([1, 0, false]);
    const two = run(ctx, [move(wrong)], one);
    expect([two.tries, two.hint, two.hinted]).toEqual([2, 1, true]);
    const three = run(ctx, [move(wrong)], two);
    expect([three.tries, three.hint]).toEqual([3, 2]);
    expect(run(ctx, [move(wrong)], three).hint).toBe(2);
  });

  it('never ends the question on wrong moves alone', () => {
    const state = run(ctx, Array.from({ length: 6 }, () => move(wrong)), toSolve());
    expect(state.phase).toBe('solve');
    expect(state.answered).toBe(false);
  });

  it('ignores the hint button where nothing is asked or the answer is on screen', () => {
    const start = initialState(ctx);
    expect(run(ctx, [hint], start)).toBe(start);
    const answered = run(ctx, [move(scripted)], toSolve());
    expect(run(ctx, [hint], answered)).toBe(answered);
  });

  it('starts again at zero on the next question', () => {
    const deep = ctxFor(italian1, 3, 5);
    const solved = run(deep, [spot(true), advance, tap('d1'), advance, hint, move(scriptedUci(italian1, 3)), advance, replied]);
    expect(solved.phase).toBe('hold');
    expect(solved.hint).toBe(0);
    expect(solved.tries).toBe(0);
    expect(solved.hinted).toBe(true);
  });
});

describe('the solve step', () => {
  const ctx = ctxFor(italian1, 3, 3);
  const toSolve = () => run(ctx, [spot(true), advance, tap('d1'), advance]);

  it('celebrates the scripted move', () => {
    const uci = scriptedUci(italian1, 3);
    const state = run(ctx, [move(uci)], toSolve());
    expect(state.feedback).toEqual({ kind: 'move', uci, turn: 3 });
    expect(state.alt).toBe(false);
  });

  it('gives another try after a wrong move and remembers the first one for the reveal', () => {
    const wrong = losingMove(italian1, 3);
    const retry = run(ctx, [move(wrong)], toSolve());
    expect(retry.phase).toBe('solve');
    expect(retry.tries).toBe(1);
    expect(retry.feedback).toEqual({ kind: 'wrong', uci: wrong });
    expect(retry.missedUci).toBe(wrong);
    expect(retry.missedTurn).toBe(3);
    expect(retry.answered).toBe(false);
  });

  it('keeps the first wrong move when later ones follow', () => {
    const [first, second] = Object.keys(italian1.turns[3].grades).filter((uci) => italian1.turns[3].grades[uci] >= BLUNDER_MIN);
    expect(run(ctx, [move(first), move(second)], toSolve()).missedUci).toBe(first);
  });

  it('lets a right second try through as correct', () => {
    const wrong = losingMove(italian1, 3);
    const state = run(ctx, [move(wrong), move(scriptedUci(italian1, 3)), advance], toSolve());
    expect(state.phase).toBe('reveal');
    expect(state.outcomes.at(-1)).toEqual({ step: 'solve', correct: true });
    expect(state.missedUci).toBe(wrong);
  });

  it('treats a move the script cannot follow as correct but ends the play-out', () => {
    const deep = ctxFor(italian1, 3, 5);
    const alt = otherHoldingMove(italian1, 3);
    const state = run(deep, [spot(true), advance, tap('d1'), advance, move(alt), advance]);
    expect(state.phase).toBe('reveal');
    expect(state.alt).toBe(true);
    expect(state.outcomes).toEqual([
      { step: 'spot', correct: true },
      { step: 'find', correct: true },
      { step: 'solve', correct: true },
    ]);
    expect(state.feedback).toBeNull();

    const done = run(deep, [{ type: 'continue' }], state);
    expect(done.phase).toBe('done');
    expect(flowResult(deep, done).resumePly).toBe(italian1.turns[3].ply);
  });

  it('marks an alternative as such in the feedback', () => {
    const alt = otherHoldingMove(italian1, 3);
    expect(run(ctx, [move(alt)], toSolve()).feedback).toEqual({ kind: 'alt', uci: alt });
  });

  it('accepts only the shown move once the move is on the board', () => {
    const alt = otherHoldingMove(italian1, 3);
    const shown = run(ctx, [hint, hint], toSolve());
    const state = run(ctx, [move(alt)], shown);
    expect(state.phase).toBe('solve');
    expect(state.feedback).toEqual({ kind: 'wrong', uci: alt });
    expect(run(ctx, [move(scriptedUci(italian1, 3))], shown).feedback).toMatchObject({ kind: 'move' });
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
    const blunder = run(ctx, [move(wrong), advance], toFirstHold());
    expect(blunder.phase).toBe('reveal');
    expect(blunder.missedUci).toBe(wrong);
    expect(revealTurn(ctx, blunder)).toBe(4);
    expect(blunder.hinted).toBe(false);
    expect(blunder.outcomes).toEqual([
      { step: 'spot', correct: true },
      { step: 'find', correct: true },
      { step: 'solve', correct: true },
      ...Array.from({ length: 5 }, () => ({ step: 'hold', correct: false })),
    ]);

    const done = run(ctx, [{ type: 'continue' }], blunder);
    expect(done.phase).toBe('done');
    expect(flowResult(ctx, done).resumePly).toBe(italian1.turns[3].ply);
  });

  it('does not end the play-out on a big loss once a hint is in hand', () => {
    const state = run(ctx, [hint, move(losingMove(italian1, 4))], toFirstHold());
    expect(state.phase).toBe('hold');
    expect(state.answered).toBe(false);
  });

  it('gives the hint ladder for a smaller slip and carries on after it', () => {
    const turns = italian1.turns.map((t, i) => (i === 4 ? { ...t, grades: { ...t.grades, h2h3: 5 } } : t));
    const slipCtx = { ...ctx, game: { ...italian1, turns } };
    const hold = run(slipCtx, [spot(true), advance, tap('d1'), advance, move(scriptedUci(italian1, 3)), advance, replied]);
    const slipped = run(slipCtx, [move('h2h3'), move('h2h3')], hold);
    expect([slipped.phase, slipped.hint]).toEqual(['hold', 1]);
    const solved = run(slipCtx, [move(scriptedUci(italian1, 4)), advance], slipped);
    expect(solved.phase).toBe('reply');
    expect(solved.outcomes.at(-1)).toEqual({ step: 'hold', correct: false });
    expect(solved.missedTurn).toBe(4);
  });

  it('stops the play-out at an alternative move and still resumes at the pause', () => {
    const alt = otherHoldingMove(italian1, 4);
    const state = run(ctx, [move(alt), advance], toFirstHold());
    expect(state.alt).toBe(true);
    const done = run(ctx, [{ type: 'continue' }], state);
    expect(done.phase).toBe('done');
    expect(flowResult(ctx, done).resumePly).toBe(italian1.turns[3].ply);
  });
});

describe('the reveal', () => {
  it('shows the pause turn unless the user went wrong at another one', () => {
    const ctx = ctxFor(italian1, 3, 5);
    const clean = run(ctx, perfectRun(ctx));
    expect(revealTurn(ctx, clean)).toBe(3);
  });

  it('says solved with a hint, not missed, when hints carried the user through', () => {
    const ctx = ctxFor(italian1, 3, 3);
    const state = run(ctx, [spot(true), advance, hint, tap('d1'), advance, hint, hint, move(scriptedUci(italian1, 3)), advance]);
    expect(state.phase).toBe('reveal');
    expect(state.hinted).toBe(true);
    expect(state.outcomes).toEqual([
      { step: 'spot', correct: true },
      { step: 'find', correct: false },
      { step: 'solve', correct: false },
    ]);
  });
});
