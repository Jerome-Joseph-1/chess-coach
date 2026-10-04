import { describe, expect, it } from 'vitest';
import type { Depth, Game } from '../content/types';
import type { Situation } from '../learn/situation';
import { whyWrong } from '../learn/whyWrong';
import {
  HOLD_MAX,
  flowReducer,
  flowResult,
  holdTurns,
  initialState,
  plannedSteps,
  revealTurn,
  scriptedUci,
  spotAnswers,
  stars,
  stepNumber,
  stepTotal,
  type FlowContext,
  type FlowEvent,
  type FlowState,
  verdictOf,
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
const spot = (pick: Situation): FlowEvent => ({ type: 'spot', pick });

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
  const events: FlowEvent[] = [spot(spotAnswers(ctx)[0]), advance];
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
      const state = run(ctx, [spot('win'), advance]);
      expect(state.phase).toBe('solve');
    }
  });

  it('follows the opponent reply between follow-up moves', () => {
    const ctx = ctxFor(italian1, 3, 5);
    const afterSolve = run(ctx, [spot('win'), advance, move(scriptedUci(italian1, 3)), advance]);
    expect(afterSolve.phase).toBe('reply');
    const asked = run(ctx, [replied], afterSolve);
    expect(asked.phase).toBe('hold');
    expect(asked.turn).toBe(4);
  });
});

describe('a quiet turn', () => {
  it.each(DEPTHS)('depth %i asks only the spot and resumes at the turn itself', (depth) => {
    const ctx = ctxFor(italian1, 11, depth, 'nothing');
    const state = run(ctx, [spot('quiet'), advance]);
    expect(state.phase).toBe('reveal');
    expect(state.outcomes).toEqual([{ step: 'spot', correct: true }]);
    const done = run(ctx, [{ type: 'continue' }], state);
    expect(done.phase).toBe('done');
    expect(flowResult(ctx, done)).toEqual({
      outcomes: [{ step: 'spot', correct: true }],
      resumePly: italian1.turns[11].ply,
      verdict: 'quiet',
      hinted: false,
    });
  });

  it('shows the error for any other answer, lets the user switch to "Improve a piece", and scores the first answer', () => {
    const ctx = ctxFor(italian1, 11, 3, 'nothing');
    expect(spotAnswers(ctx)).toEqual(['quiet']);
    const wrong = run(ctx, [spot('defend')]);
    expect(wrong.phase).toBe('spot');
    expect(wrong.answered).toBe(false);
    expect(wrong.feedback).toEqual({ kind: 'spot', correct: false });
    const state = run(ctx, [spot('quiet'), advance], wrong);
    expect(state.phase).toBe('reveal');
    expect(state.outcomes).toEqual([{ step: 'spot', correct: false }]);
  });
});

describe('the spot step', () => {
  const ctx = ctxFor(italian1, 3, 3);

  it('holds the right answer on screen until advance, then asks for the move', () => {
    const answered = run(ctx, [spot('win')]);
    expect(answered.phase).toBe('spot');
    expect(answered.answered).toBe(true);
    expect(answered.feedback).toEqual({ kind: 'spot', correct: true });
    expect(answered.spot).toBe('win');
    expect(run(ctx, [spot('quiet')], answered)).toBe(answered);
    expect(run(ctx, [advance], answered).phase).toBe('solve');
  });

  it('is only an error when the answer is wrong: the question stays open for another pick', () => {
    const wrong = run(ctx, [spot('quiet')]);
    expect(wrong.phase).toBe('spot');
    expect(wrong.answered).toBe(false);
    expect(wrong.spot).toBe('quiet');
    expect(wrong.outcomes).toEqual([]);
    expect(wrong.feedback).toEqual({ kind: 'spot', correct: false });
    expect(run(ctx, [advance], wrong)).toBe(wrong);
  });

  it('takes a right second pick, and scores the first answer', () => {
    const state = run(ctx, [spot('quiet'), spot('win'), advance]);
    expect(state.phase).toBe('solve');
    expect(state.spotShown).toBeNull();
    expect(state.outcomes).toEqual([{ step: 'spot', correct: false }]);
  });

  it('shows the right answer after the second wrong pick and moves on like a right pick, scored as a hint', () => {
    const shown = run(ctx, [spot('quiet'), spot('trap')]);
    expect(shown.phase).toBe('spot');
    expect(shown.answered).toBe(true);
    expect(shown.spot).toBe('trap');
    expect(shown.spotShown).toBe('win');
    expect(shown.feedback).toEqual({ kind: 'spot', correct: false });
    expect(shown.outcomes).toEqual([{ step: 'spot', correct: false }]);
    expect(run(ctx, [spot('win')], shown)).toBe(shown);

    const next = run(ctx, [advance], shown);
    expect(next.phase).toBe('solve');
    expect(next.spotShown).toBe('win');
    expect(verdictOf(ctx, run(ctx, [move(scriptedUci(italian1, 3)), advance], next))).toBe('hinted');
  });

  it('shows the most urgent answer of a position about two things', () => {
    const both = ctxFor(italian1, 7, 3);
    expect(run(both, [spot('attack'), spot('trap')]).spotShown).toBe('defend');
  });

  it('shows the answer to a quiet position too, then its reveal', () => {
    const quiet = ctxFor(italian1, 11, 3, 'nothing');
    const shown = run(quiet, [spot('win'), spot('defend')]);
    expect(shown.spotShown).toBe('quiet');
    expect(run(quiet, [advance], shown).phase).toBe('reveal');
  });

  it('scores a right first answer as right', () => {
    expect(run(ctx, [spot('win'), advance]).outcomes).toEqual([{ step: 'spot', correct: true }]);
  });

  it('takes any answer that fits a position about two things', () => {
    const both = ctxFor(italian1, 7, 3);
    expect(spotAnswers(both)).toEqual(['win', 'defend']);
    for (const pick of ['win', 'defend'] as const) expect(run(both, [spot(pick), advance]).outcomes).toEqual([{ step: 'spot', correct: true }]);
    expect(run(both, [spot('trap')]).answered).toBe(false);
  });

  it('ignores the hint and the solution buttons', () => {
    const start = initialState(ctx);
    expect(run(ctx, [hint], start)).toBe(start);
    expect(run(ctx, [solution], start)).toBe(start);
  });
});

describe('the play step', () => {
  const ctx = ctxFor(italian1, 3, 3);
  const toSolve = () => run(ctx, [spot('win'), advance]);
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
    expect(state.feedback).toEqual({ kind: 'wrong', uci: wrong, why: whyWrong(italian1, 3, wrong, 0) });
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
    const state = run(deep, [spot('win'), advance, move(alt), advance]);
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
    const shown = run(ctx, [hint, hint, hint], toSolve());
    const state = run(ctx, [move(alt)], shown);
    expect(state.phase).toBe('solve');
    expect(state.feedback).toEqual({ kind: 'wrong', uci: alt, why: whyWrong(italian1, 3, alt, 3) });
    expect(state.feedback?.kind === 'wrong' && state.feedback.why.text).toBe('Not quite. Try again.');
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
  const toSolve = () => run(ctx, [spot('win'), advance]);
  const scripted = scriptedUci(italian1, 3);

  it('walks from the pattern to the piece to the move and stops there', () => {
    const first = run(ctx, [hint], toSolve());
    expect(first.hint).toBe(1);
    const second = run(ctx, [hint], first);
    expect(second.hint).toBe(2);
    const third = run(ctx, [hint], second);
    expect(third.hint).toBe(3);
    expect(run(ctx, [hint], third)).toBe(third);
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

  it('explains a wrong move as far as the hints allow, until the next hint replaces it', () => {
    const wrong = losingMove(italian1, 3);
    const tried = run(ctx, [hint, move(wrong)], toSolve());
    expect(tried.feedback).toEqual({ kind: 'wrong', uci: wrong, why: whyWrong(italian1, 3, wrong, 1) });
    expect(run(ctx, [hint], tried).feedback).toBeNull();
  });

  it('starts again at zero on the next question, and remembers a hint was used', () => {
    const deep = ctxFor(italian1, 3, 5);
    const solved = run(deep, [spot('win'), advance, hint, move(scriptedUci(italian1, 3)), advance, replied]);
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
  const toSolve = () => run(ctx, [spot('win'), advance]);

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
    const state = run(deep, [spot('win'), advance, solution]);
    expect(state.outcomes).toHaveLength(plannedSteps(deep).length);
    expect(state.outcomes.slice(2).every((o) => !o.correct)).toBe(true);
  });

  it('shows the lines of the later turn when asked in the play-out', () => {
    const deep = ctxFor(italian1, 3, 5);
    const hold = run(deep, [spot('win'), advance, move(scriptedUci(italian1, 3)), advance, replied]);
    expect(hold.phase).toBe('hold');
    const state = run(deep, [solution], hold);
    expect(state.phase).toBe('reveal');
    expect(revealTurn(deep, state)).toBe(4);
    expect(state.outcomes.slice(0, 2).every((o) => o.correct)).toBe(true);
    expect(state.outcomes.slice(2).every((o) => !o.correct)).toBe(true);
  });

  it('hands the board back at the pause position all the same', () => {
    const deep = ctxFor(italian1, 3, 5);
    const hold = run(deep, [spot('win'), advance, move(scriptedUci(italian1, 3)), advance, replied]);
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
  const toFirstHold = () => run(ctx, [spot('win'), advance, move(scriptedUci(italian1, 3)), advance, replied]);

  it('grades the next turn with its own grades', () => {
    const state = toFirstHold();
    expect(state.phase).toBe('hold');
    const uci = scriptedUci(italian1, 4);
    expect(run(ctx, [move(uci)], state).feedback).toEqual({ kind: 'move', uci, turn: 4 });
  });

  it('accepts a scripted move even when its grade is above the hold limit', () => {
    const state = run(ctx, [spot('win'), advance, move(scriptedUci(italian1, 3)), advance, replied, move(scriptedUci(italian1, 4)), advance, replied]);
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
    expect(state.feedback).toEqual({ kind: 'wrong', uci: wrong, why: whyWrong(italian1, 4, wrong, 0) });
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
    const state = run(ctx, [spot('win'), advance, hint, hint, move(scriptedUci(italian1, 3)), advance]);
    expect(state.phase).toBe('reveal');
    expect(state.hinted).toBe(true);
    expect(state.outcomes).toEqual([
      { step: 'spot', correct: true },
      { step: 'solve', correct: false },
    ]);
  });

  it('gives the verdict for the mark on the move: found, found with a hint or after a wrong first answer, or missed', () => {
    const ctx = ctxFor(italian1, 3, 3);
    expect(verdictOf(ctx, run(ctx, perfectRun(ctx)))).toBe('found');
    expect(verdictOf(ctx, run(ctx, [spot('win'), advance, hint, move(scriptedUci(italian1, 3))]))).toBe('hinted');
    expect(flowResult(ctx, run(ctx, [spot('win'), advance, hint, move(scriptedUci(italian1, 3))])).hinted).toBe(true);
    expect(verdictOf(ctx, run(ctx, [spot('win'), advance, hint, solution]))).toBe('missed');
    expect(verdictOf(ctx, run(ctx, [spot('quiet'), spot('win'), advance, move(scriptedUci(italian1, 3))]))).toBe('hinted');
    expect(verdictOf(ctx, run(ctx, [spot('quiet'), spot('win'), advance, hint, solution]))).toBe('missed');
    expect(verdictOf(ctxFor(italian1, 11, 3, 'nothing'), initialState(ctxFor(italian1, 11, 3, 'nothing')))).toBe('quiet');
  });

  it('only continues from the reveal', () => {
    const ctx = ctxFor(italian1, 3, 3);
    const start = initialState(ctx);
    expect(run(ctx, [{ type: 'continue' }], start)).toBe(start);
  });
});

describe('a lesson practice position', () => {
  const drill = (depth: Depth): FlowContext => ({ ...ctxFor(italian1, 3, depth), mode: 'drill' });

  it('starts at the move with the pattern already named, and asks nothing after it', () => {
    const ctx = drill(5);
    const state = initialState(ctx);
    expect(state.phase).toBe('solve');
    expect(state.hint).toBe(1);
    expect(holdTurns(ctx)).toEqual([]);
    expect(plannedSteps(ctx)).toEqual(['solve']);
    expect(stepNumber(ctx, 'solve', 3)).toBe(1);
  });

  it('counts the move as found without a hint, then reveals', () => {
    const ctx = drill(3);
    const state = run(ctx, [move(scriptedUci(italian1, 3)), advance]);
    expect(state.phase).toBe('reveal');
    expect(state.outcomes).toEqual([{ step: 'solve', correct: true }]);
    expect(verdictOf(ctx, state)).toBe('found');
  });

  it('climbs the hint ladder from the piece', () => {
    const ctx = drill(3);
    const state = run(ctx, [hint]);
    expect(state.hint).toBe(2);
    expect(state.hinted).toBe(true);
    const done = run(ctx, [move(scriptedUci(italian1, 3)), advance], state);
    expect(done.outcomes).toEqual([{ step: 'solve', correct: false }]);
    expect(verdictOf(ctx, done)).toBe('hinted');
  });
});
