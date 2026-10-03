import { describe, expect, it } from 'vitest';
import type { Depth, Game } from '../content/types';
import {
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
const solution: FlowEvent = { type: 'solution' };
const move = (uci: string): FlowEvent => ({ type: 'move', uci });
const spot = (up: boolean): FlowEvent => ({ type: 'spot', up });

/** A move at this turn that loses at least `min` win%. */
function losingMove(game: Game, turnIndex: number, min = 10): string {
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
  const { game, turnIndex } = ctx;
  const events: FlowEvent[] = [spot(true), advance];
  const asked = [turnIndex, ...holdTurns(ctx)];
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
  it('asks no follow-up up to depth 3, one at depth 4 and up to five at depth 5', () => {
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

  it('asks spot and play at depth 1 to 3, then the follow-ups', () => {
    for (const depth of [1, 2, 3] as const) expect(plannedSteps(ctxFor(italian1, 3, depth))).toEqual(['spot', 'solve']);
    expect(plannedSteps(ctxFor(italian1, 3, 4))).toEqual(['spot', 'solve', 'hold']);
    expect(plannedSteps(ctxFor(italian1, 3, 5))).toEqual(['spot', 'solve', 'hold', 'hold', 'hold', 'hold', 'hold']);
    expect(plannedSteps(ctxFor(italian1, 11, 5, 'nothing'))).toEqual(['spot']);
  });
});

describe('the step header', () => {
  it('counts spot and play as two steps, and each follow-up move as one more', () => {
    const totals = DEPTHS.map((depth) => stepTotal(ctxFor(italian1, 3, depth)));
    expect(totals).toEqual([2, 2, 2, 3, 7]);
  });

  it('counts one step for a quiet position at any depth', () => {
    for (const depth of DEPTHS) expect(stepTotal(ctxFor(italian1, 11, depth, 'nothing'))).toBe(1);
  });

  it('numbers spot 1, play 2 and each follow-up after it, the opponent reply with the move before', () => {
    const ctx = ctxFor(italian1, 3, 5);
    expect(stepNumber(ctx, 'spot', 3)).toBe(1);
    expect(stepNumber(ctx, 'solve', 3)).toBe(2);
    expect(stepNumber(ctx, 'reply', 3)).toBe(2);
    expect(stepNumber(ctx, 'hold', 4)).toBe(3);
    expect(stepNumber(ctx, 'reply', 7)).toBe(6);
    expect(stepNumber(ctx, 'hold', 8)).toBe(7);
  });

  it('leaves the reveal unnumbered', () => {
    const ctx = ctxFor(italian1, 3, 3);
    expect(['reveal', 'done'].map((phase) => stepNumber(ctx, phase as never, 3))).toEqual([null, null]);
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

  it('asks the user to play the move after a right spot, at every depth', () => {
    for (const depth of DEPTHS) {
      const ctx = ctxFor(italian1, 3, depth);
      const state = run(ctx, [spot(true), advance]);
      expect(state.phase).toBe('solve');
    }
  });

  it('follows the opponent reply between follow-up moves', () => {
    const ctx = ctxFor(italian1, 3, 5);
    const afterSolve = run(ctx, [spot(true), advance, move(scriptedUci(italian1, 3)), advance]);
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

  it('shows the error for "Something\'s up", lets the user switch to "Nothing special", and scores the first answer', () => {
    const ctx = ctxFor(italian1, 11, 3, 'nothing');
    const wrong = run(ctx, [spot(true)]);
    expect(wrong.phase).toBe('spot');
    expect(wrong.answered).toBe(false);
    expect(wrong.feedback).toEqual({ kind: 'spot', correct: false });
    const state = run(ctx, [spot(false), advance], wrong);
    expect(state.phase).toBe('reveal');
    expect(state.outcomes).toEqual([{ step: 'spot', correct: false }]);
  });
});

describe('the spot step', () => {
  const ctx = ctxFor(italian1, 3, 3);

  it('holds the right answer on screen until advance, then asks for the move', () => {
    const answered = run(ctx, [spot(true)]);
    expect(answered.phase).toBe('spot');
    expect(answered.answered).toBe(true);
    expect(answered.feedback).toEqual({ kind: 'spot', correct: true });
    expect(answered.spotUp).toBe(true);
    expect(run(ctx, [spot(false)], answered)).toBe(answered);
    expect(run(ctx, [advance], answered).phase).toBe('solve');
  });

  it('is only an error when the answer is wrong: the question stays open for another pick', () => {
    const wrong = run(ctx, [spot(false)]);
    expect(wrong.phase).toBe('spot');
    expect(wrong.answered).toBe(false);
    expect(wrong.spotUp).toBe(false);
    expect(wrong.outcomes).toEqual([]);
    expect(wrong.feedback).toEqual({ kind: 'spot', correct: false });
    expect(run(ctx, [advance], wrong)).toBe(wrong);
  });

  it('lets the user keep trying, and scores the first answer', () => {
    const state = run(ctx, [spot(false), spot(false), spot(true), advance]);
    expect(state.phase).toBe('solve');
    expect(state.outcomes).toEqual([{ step: 'spot', correct: false }]);
  });

  it('scores a right first answer as right', () => {
    expect(run(ctx, [spot(true), advance]).outcomes).toEqual([{ step: 'spot', correct: true }]);
  });

  it('ignores the hint and the solution buttons', () => {
    const start = initialState(ctx);
    expect(run(ctx, [hint], start)).toBe(start);
    expect(run(ctx, [solution], start)).toBe(start);
  });
});

describe('the play step', () => {
  const ctx = ctxFor(italian1, 3, 3);
  const toSolve = () => run(ctx, [spot(true), advance]);
  const scripted = scriptedUci(italian1, 3);
  const wrong = losingMove(italian1, 3);

  it('celebrates the scripted move', () => {
    const state = run(ctx, [move(scripted)], toSolve());
    expect(state.feedback).toEqual({ kind: 'move', uci: scripted, turn: 3 });
    expect(state.alt).toBe(false);
    expect(state.next).toBe('reveal');
    expect(state.outcomes.at(-1)).toEqual({ step: 'solve', correct: true });
  });

  it('only shows an error for a wrong move, however often it is tried', () => {
    const state = run(ctx, Array.from({ length: 8 }, () => move(wrong)), toSolve());
    expect(state.phase).toBe('solve');
    expect(state.answered).toBe(false);
    expect(state.tries).toBe(8);
    expect(state.hint).toBe(0);
    expect(state.hinted).toBe(false);
    expect(state.feedback).toEqual({ kind: 'wrong', uci: wrong });
    expect(state.outcomes).toEqual([{ step: 'spot', correct: true }]);
  });

  it('counts the right move as right after wrong ones, without a hint', () => {
    const state = run(ctx, [move(wrong), move(wrong), move(scripted)], toSolve());
    expect(state.outcomes.at(-1)).toEqual({ step: 'solve', correct: true });
    expect(state.hinted).toBe(false);
  });

  it('treats a move the script cannot follow as correct but ends the play-out', () => {
    const deep = ctxFor(italian1, 3, 5);
    const alt = otherHoldingMove(italian1, 3);
    const state = run(deep, [spot(true), advance, move(alt), advance]);
    expect(state.phase).toBe('reveal');
    expect(state.alt).toBe(true);
    expect(state.outcomes).toEqual([
      { step: 'spot', correct: true },
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
    expect(run(ctx, [move(scripted)], shown).feedback).toMatchObject({ kind: 'move' });
  });

  it('ignores moves while the answer is on screen and before it is asked', () => {
    const answered = run(ctx, [move(scripted)], toSolve());
    expect(run(ctx, [move(wrong)], answered)).toBe(answered);
    const start = initialState(ctx);
    expect(run(ctx, [move(scripted)], start)).toBe(start);
  });
});

describe('hints', () => {
  const ctx = ctxFor(italian1, 3, 3);
  const toSolve = () => run(ctx, [spot(true), advance]);
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

  it('never comes by itself', () => {
    const wrong = losingMove(italian1, 3);
    const state = run(ctx, Array.from({ length: 6 }, () => move(wrong)), toSolve());
    expect(state.hint).toBe(0);
  });

  it('keeps the hint through wrong moves', () => {
    const wrong = losingMove(italian1, 3);
    expect(run(ctx, [hint, move(wrong), move(wrong)], toSolve()).hint).toBe(1);
  });

  it('starts again at zero on the next question, and remembers a hint was used', () => {
    const deep = ctxFor(italian1, 3, 5);
    const solved = run(deep, [spot(true), advance, hint, move(scriptedUci(italian1, 3)), advance, replied]);
    expect(solved.phase).toBe('hold');
    expect(solved.hint).toBe(0);
    expect(solved.tries).toBe(0);
    expect(solved.hinted).toBe(true);
  });

  it('is ignored while the answer is on screen', () => {
    const answered = run(ctx, [move(scripted)], toSolve());
    expect(run(ctx, [hint], answered)).toBe(answered);
  });
});

describe('show solution', () => {
  const ctx = ctxFor(italian1, 3, 3);
  const toSolve = () => run(ctx, [spot(true), advance]);

  it('goes straight to the reveal, scored as missed', () => {
    const state = run(ctx, [solution], toSolve());
    expect(state.phase).toBe('reveal');
    expect(state.answered).toBe(false);
    expect(state.outcomes).toEqual([
      { step: 'spot', correct: true },
      { step: 'solve', correct: false },
    ]);
    expect(state.hinted).toBe(false);
    expect(revealTurn(ctx, state)).toBe(3);
  });

  it('is missed even after hints, and remembers the first wrong move for the reveal', () => {
    const wrong = losingMove(italian1, 3);
    const state = run(ctx, [hint, move(wrong), solution], toSolve());
    expect(state.hinted).toBe(false);
    expect(state.missedUci).toBe(wrong);
    expect(state.outcomes.at(-1)).toEqual({ step: 'solve', correct: false });
  });

  it('has no wrong move to show when none was tried', () => {
    expect(run(ctx, [solution], toSolve()).missedUci).toBeNull();
  });

  it('counts the follow-ups still to come as missed', () => {
    const deep = ctxFor(italian1, 3, 5);
    const state = run(deep, [spot(true), advance, solution]);
    expect(state.outcomes).toHaveLength(plannedSteps(deep).length);
    expect(state.outcomes.slice(2).every((o) => !o.correct)).toBe(true);
  });

  it('shows the lines of the later turn when asked in the play-out', () => {
    const deep = ctxFor(italian1, 3, 5);
    const hold = run(deep, [spot(true), advance, move(scriptedUci(italian1, 3)), advance, replied]);
    expect(hold.phase).toBe('hold');
    const state = run(deep, [solution], hold);
    expect(state.phase).toBe('reveal');
    expect(revealTurn(deep, state)).toBe(4);
    expect(state.outcomes.slice(0, 2).every((o) => o.correct)).toBe(true);
    expect(state.outcomes.slice(2).every((o) => !o.correct)).toBe(true);
  });

  it('hands the board back at the pause position all the same', () => {
    const deep = ctxFor(italian1, 3, 5);
    const hold = run(deep, [spot(true), advance, move(scriptedUci(italian1, 3)), advance, replied]);
    const done = run(deep, [solution, { type: 'continue' }], hold);
    expect(done.phase).toBe('done');
    expect(flowResult(deep, done).resumePly).toBe(italian1.turns[3].ply);
  });

  it('is ignored while the answer is on screen', () => {
    const answered = run(ctx, [move(scriptedUci(italian1, 3))], toSolve());
    expect(run(ctx, [solution], answered)).toBe(answered);
  });
});

describe('the follow-up steps', () => {
  const ctx = ctxFor(italian1, 3, 5);
  const toFirstHold = () => run(ctx, [spot(true), advance, move(scriptedUci(italian1, 3)), advance, replied]);

  it('grades the next turn with its own grades', () => {
    const state = toFirstHold();
    expect(state.phase).toBe('hold');
    const uci = scriptedUci(italian1, 4);
    expect(run(ctx, [move(uci)], state).feedback).toEqual({ kind: 'move', uci, turn: 4 });
  });

  it('accepts a scripted move even when its grade is above the hold limit', () => {
    const state = run(ctx, [spot(true), advance, move(scriptedUci(italian1, 3)), advance, replied, move(scriptedUci(italian1, 4)), advance, replied]);
    expect(state.turn).toBe(5);
    const uci = scriptedUci(italian1, 5);
    expect(italian1.turns[5].grades[uci]).toBeGreaterThan(HOLD_MAX);
    expect(run(ctx, [move(uci)], state).feedback).toEqual({ kind: 'move', uci, turn: 5 });
  });

  it('only shows an error for a big blunder too, and lets the user try again', () => {
    const wrong = losingMove(italian1, 4);
    const state = run(ctx, [move(wrong), move(wrong)], toFirstHold());
    expect(state.phase).toBe('hold');
    expect(state.answered).toBe(false);
    expect(state.feedback).toEqual({ kind: 'wrong', uci: wrong });
    const solved = run(ctx, [move(scriptedUci(italian1, 4)), advance], state);
    expect(solved.phase).toBe('reply');
    expect(solved.outcomes.at(-1)).toEqual({ step: 'hold', correct: true });
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
  it('shows the pause turn when nothing was given up', () => {
    const ctx = ctxFor(italian1, 3, 5);
    expect(revealTurn(ctx, run(ctx, perfectRun(ctx)))).toBe(3);
  });

  it('says solved with a hint, not missed, when hints carried the user through', () => {
    const ctx = ctxFor(italian1, 3, 3);
    const state = run(ctx, [spot(true), advance, hint, hint, move(scriptedUci(italian1, 3)), advance]);
    expect(state.phase).toBe('reveal');
    expect(state.hinted).toBe(true);
    expect(state.outcomes).toEqual([
      { step: 'spot', correct: true },
      { step: 'solve', correct: false },
    ]);
  });

  it('only continues from the reveal', () => {
    const ctx = ctxFor(italian1, 3, 3);
    const start = initialState(ctx);
    expect(run(ctx, [{ type: 'continue' }], start)).toBe(start);
  });
});
