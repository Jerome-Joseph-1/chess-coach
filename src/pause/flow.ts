import type { Depth, Game, StepName, StepOutcome } from '../content/types';
import { mainSituation, situationsOf, type Situation } from '../learn/situation';
import { whyWrong, type WrongMove } from '../learn/whyWrong';
import { fenAfter, uciOfSan } from './position';

/** A move losing at most this much win% still holds the position. */
export const HOLD_MAX = 2.5;
/** Wrong picks on step 1 before the coach shows the right one. */
const SPOT_TRIES = 2;
/** Follow-up moves asked after the first one: none up to stage 3, one at stage 4, up to five at stage 5. */
const HOLD_MOVES: Record<Depth, number> = { 1: 0, 2: 0, 3: 0, 4: 1, 5: 5 };

export interface FlowContext {
  game: Game;
  turnIndex: number;
  type: 'pause' | 'nothing';
  depth: Depth;
  /** A lesson's practice position: straight to the move, the pattern already named, no follow-up moves. */
  mode?: 'game' | 'drill';
}

function isDrill(ctx: FlowContext): boolean {
  return ctx.mode === 'drill';
}

/** The hint a question starts with: a drill has already named its pattern. */
function startingHint(ctx: FlowContext): HintLevel {
  return isDrill(ctx) ? 1 : 0;
}

export type Phase = 'spot' | 'solve' | 'hold' | 'reply' | 'reveal' | 'done';

/** 1 names the pattern, 2 marks the piece in trouble, 3 draws the move. */
export type HintLevel = 0 | 1 | 2 | 3;

/** What the view should react to after an event: sound, confetti, highlights. */
export type Feedback =
  | { kind: 'spot'; correct: boolean }
  | { kind: 'move'; uci: string; turn: number }
  | { kind: 'alt'; uci: string }
  | { kind: 'wrong'; uci: string; why: WrongMove };

export interface FlowState {
  phase: Phase;
  /** Turn whose position is asked, shown or played now; moves on during the play-out. */
  turn: number;
  /** Wrong answers on the current question. They never end it. */
  tries: number;
  /** How much help the current question has been given, on request. */
  hint: HintLevel;
  /** The current question is settled and its feedback is on screen until `advance`. */
  answered: boolean;
  /** Where `advance` goes after the feedback. */
  next: Phase | null;
  /** The user's latest answer to "What's going on here?". */
  spot: Situation | null;
  /** The right answer to step 1, shown by the coach after the second wrong pick. */
  spotShown: Situation | null;
  /** What the first answer to each settled question scored. */
  outcomes: StepOutcome[];
  /** The scripted move at the last turn is not on the board: a different but fine move ended the play-out. */
  alt: boolean;
  /** Some question needed a hint, and the pause was not given up: the result says solved with a hint. */
  hinted: boolean;
  /** The first wrong move tried on the current question. */
  wrongUci: string | null;
  /** The user asked for the solution: the turn it was asked at, and the wrong move tried there, if any. */
  missedTurn: number | null;
  missedUci: string | null;
  feedback: Feedback | null;
}

export type FlowEvent =
  | { type: 'spot'; pick: Situation }
  | { type: 'move'; uci: string }
  | { type: 'hint' }
  | { type: 'solution' }
  | { type: 'advance' }
  | { type: 'replied' }
  | { type: 'continue' };

export function initialState(ctx: FlowContext): FlowState {
  return {
    phase: isDrill(ctx) ? 'solve' : 'spot',
    turn: ctx.turnIndex,
    tries: 0,
    hint: startingHint(ctx),
    answered: false,
    next: null,
    spot: null,
    spotShown: null,
    outcomes: [],
    alt: false,
    hinted: false,
    wrongUci: null,
    missedTurn: null,
    missedUci: null,
    feedback: null,
  };
}

/** The answers to "What's going on here?" that count as right; a quiet pause accepts only "Improve a piece". */
export function spotAnswers(ctx: FlowContext): Situation[] {
  return ctx.type === 'nothing' ? ['quiet'] : situationsOf(ctx.game, ctx.turnIndex);
}

export function scriptedUci(game: Game, turnIndex: number): string {
  const turn = game.turns[turnIndex];
  return uciOfSan(turn.fen, game.moves[turn.ply]);
}

/** The opponent's scripted answer to the user's scripted move at this turn. */
export function replyUci(game: Game, turnIndex: number): string {
  const turn = game.turns[turnIndex];
  const afterScripted = fenAfter(turn.fen, [scriptedUci(game, turnIndex)]);
  return uciOfSan(afterScripted, game.moves[turn.ply + 1]);
}

/** Turn indexes asked after the solve step. A play-out of 5 stops before a quiet turn. */
export function holdTurns(ctx: FlowContext): number[] {
  const { game, turnIndex, depth } = ctx;
  const turns: number[] = [];
  if (isDrill(ctx)) return turns;
  for (let i = turnIndex + 1; turns.length < HOLD_MOVES[depth]; i++) {
    const next = game.turns[i];
    if (!next || next.ply !== game.turns[i - 1].ply + 2) break;
    if (depth === 5 && next.label === 'nothing') break;
    turns.push(i);
  }
  return turns;
}

/** Every step this pause asks, in order: spot, play, then the follow-up moves of stage 4 and 5. */
export function plannedSteps(ctx: FlowContext): StepName[] {
  if (ctx.type === 'nothing') return ['spot'];
  if (isDrill(ctx)) return ['solve'];
  return ['spot', 'solve', ...holdTurns(ctx).map((): StepName => 'hold')];
}

export function stars(outcomes: StepOutcome[]): number {
  return outcomes.filter((o) => o.correct).length;
}

/** Steps the sheet counts in its header: Spot, Play, then each follow-up move. */
export function stepTotal(ctx: FlowContext): number {
  return plannedSteps(ctx).length;
}

/** Which counted step a phase at `turn` belongs to; the reveal is not a step. */
export function stepNumber(ctx: FlowContext, phase: Phase, turn: number): number | null {
  if (phase === 'spot') return 1;
  if (phase !== 'solve' && phase !== 'hold' && phase !== 'reply') return null;
  const at = [ctx.turnIndex, ...holdTurns(ctx)].indexOf(turn);
  if (at < 0) return null;
  return isDrill(ctx) ? 1 + at : 2 + at;
}

/** Turn whose lines the reveal shows: where the user asked for the solution, else the pause itself. */
export function revealTurn(ctx: FlowContext, state: FlowState): number {
  return state.missedTurn ?? ctx.turnIndex;
}

/** How a pause went, for the mark on its move: found, found with a hint, missed, or a quiet position. */
export type Verdict = 'found' | 'hinted' | 'missed' | 'quiet';

export function verdictOf(ctx: FlowContext, state: FlowState): Verdict {
  if (ctx.type === 'nothing') return 'quiet';
  if (state.outcomes.length > 0 && state.outcomes.every((o) => o.correct)) return 'found';
  return state.hinted ? 'hinted' : 'missed';
}

/** The sheet hands the board back on the pause position, so the game resumes at the scripted move there. */
export function flowResult(ctx: FlowContext, state: FlowState) {
  const verdict = verdictOf(ctx, state);
  return { outcomes: state.outcomes, resumePly: ctx.game.turns[ctx.turnIndex].ply, verdict, hinted: verdict === 'hinted' };
}

export function flowReducer(ctx: FlowContext, state: FlowState, event: FlowEvent): FlowState {
  switch (event.type) {
    case 'spot':
      return state.phase === 'spot' && !state.answered ? answerSpot(ctx, state, event.pick) : state;
    case 'move':
      return playMove(ctx, state, event.uci);
    case 'hint':
      return takeHint(state);
    case 'solution':
      return showSolution(ctx, state);
    case 'advance':
      return advance(state);
    case 'replied':
      return state.phase === 'reply' ? { ...state, phase: 'hold', turn: state.turn + 1, feedback: null } : state;
    case 'continue':
      return state.phase === 'reveal' ? { ...state, phase: 'done', feedback: null } : state;
  }
}

function settle(
  state: FlowState,
  outcomes: StepOutcome[],
  next: Phase,
  feedback: Feedback,
  patch: Partial<FlowState> = {},
): FlowState {
  return { ...state, ...patch, outcomes, answered: true, next, feedback };
}

function isAsking(state: FlowState): boolean {
  return !state.answered && (state.phase === 'solve' || state.phase === 'hold');
}

/**
 * A first wrong answer is only an error and the question stays open; the second shows the right one and moves on.
 * Only a right first answer counts as right.
 */
function answerSpot(ctx: FlowContext, state: FlowState, pick: Situation): FlowState {
  const answers = spotAnswers(ctx);
  const correct = answers.includes(pick);
  const tries = correct ? state.tries : state.tries + 1;
  const feedback: Feedback = { kind: 'spot', correct };
  if (!correct && tries < SPOT_TRIES) return { ...state, spot: pick, tries, feedback };
  const outcomes: StepOutcome[] = [...state.outcomes, { step: 'spot', correct: tries === 0 }];
  const spotShown = correct ? null : mainSituation(answers);
  return settle(state, outcomes, ctx.type === 'pause' ? 'solve' : 'reveal', feedback, { spot: pick, tries, spotShown });
}

/** A hint replaces whatever the last answer earned. */
function takeHint(state: FlowState): FlowState {
  if (!isAsking(state) || state.hint >= 3) return state;
  // Follow-up moves have no pattern of their own to name, so their first hint marks the piece.
  const hint = state.hint === 0 && state.phase === 'hold' ? 2 : state.hint + 1;
  return { ...state, hint: hint as HintLevel, hinted: true, feedback: null };
}

function playMove(ctx: FlowContext, state: FlowState, uci: string): FlowState {
  if (!isAsking(state)) return state;

  const step = state.phase === 'hold' ? 'hold' : 'solve';
  const grade = ctx.game.turns[state.turn].grades[uci];
  const outcomes: StepOutcome[] = [...state.outcomes, { step, correct: state.hint <= startingHint(ctx) }];

  if (uci === scriptedUci(ctx.game, state.turn)) {
    const last = holdTurns(ctx).at(-1) ?? ctx.turnIndex;
    const next = state.turn < last ? 'reply' : 'reveal';
    return settle(state, outcomes, next, { kind: 'move', uci, turn: state.turn });
  }
  // With the move already drawn on the board, only that move counts.
  if (state.hint < 3 && grade !== undefined && grade <= HOLD_MAX) {
    return settle(state, outcomes, 'reveal', { kind: 'alt', uci }, { alt: true });
  }
  const why = whyWrong(ctx.game, state.turn, uci, state.hint);
  return { ...state, tries: state.tries + 1, wrongUci: state.wrongUci ?? uci, feedback: { kind: 'wrong', uci, why } };
}

/** A failed step ends the pause: the steps it would still have asked count as missed. */
function failRest(ctx: FlowContext, outcomes: StepOutcome[]): StepOutcome[] {
  const rest = plannedSteps(ctx).slice(outcomes.length);
  return [...outcomes, ...rest.map((step) => ({ step, correct: false }))];
}

/** "Show solution": a miss, and the reveal comes at once. */
function showSolution(ctx: FlowContext, state: FlowState): FlowState {
  if (!isAsking(state)) return state;
  const step = state.phase === 'hold' ? 'hold' : 'solve';
  const outcomes = failRest(ctx, [...state.outcomes, { step, correct: false }]);
  const given = { ...state, outcomes, hinted: false, missedTurn: state.turn, missedUci: state.wrongUci };
  return { ...given, phase: 'reveal', tries: 0, hint: 0, feedback: null };
}

function advance(state: FlowState): FlowState {
  if (!state.answered || !state.next) return state;
  return { ...state, phase: state.next, next: null, answered: false, tries: 0, hint: 0, wrongUci: null, feedback: null };
}
