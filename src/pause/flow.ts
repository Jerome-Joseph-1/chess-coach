import type { Depth, Game, StepName, StepOutcome } from '../content/types';
import { fenAfter, uciOfSan } from './position';

/** A move losing at most this much win% still holds the position. */
export const HOLD_MAX = 2.5;
/** In the play-out, a move losing this much ends it at once. */
export const BLUNDER_MIN = 10;
const HOLD_MOVES: Record<Depth, number> = { 1: 0, 2: 0, 3: 0, 4: 1, 5: 5 };

export interface FlowContext {
  game: Game;
  turnIndex: number;
  type: 'pause' | 'nothing';
  depth: Depth;
}

export type Phase = 'spot' | 'find' | 'solve' | 'hold' | 'reply' | 'reveal' | 'done';

/** 0 none yet, 1 the piece is marked, 2 the move is drawn. The Point step only goes to 1. */
export type HintLevel = 0 | 1 | 2;

/** What the view should react to after an event: sound, confetti, highlights. */
export type Feedback =
  | { kind: 'spot'; correct: boolean }
  | { kind: 'find'; correct: boolean; square: string }
  | { kind: 'move'; uci: string; turn: number }
  | { kind: 'alt'; uci: string }
  | { kind: 'wrong'; uci: string };

export interface FlowState {
  phase: Phase;
  /** Turn whose position is asked, shown or played now; moves on during the play-out. */
  turn: number;
  /** Wrong answers on the current question. */
  tries: number;
  /** How much help the current question has given, by request or after wrong answers. */
  hint: HintLevel;
  /** The current question is settled and its feedback is on screen until `advance`. */
  answered: boolean;
  /** Where `advance` goes after the feedback. */
  next: Phase | null;
  /** The user's spot answer: true for "Something's up". */
  spotUp: boolean | null;
  /** The square of the piece the user picked at the find step. */
  picked: string | null;
  outcomes: StepOutcome[];
  /** The scripted move at the last turn is not on the board: a different but fine move ended the play-out. */
  alt: boolean;
  /** Some question needed a hint, and the pause was not lost: the result says solved with a hint. */
  hinted: boolean;
  /** The first losing move the user played, and the turn it was played at. */
  missedUci: string | null;
  missedTurn: number | null;
  feedback: Feedback | null;
}

export type FlowEvent =
  | { type: 'spot'; up: boolean }
  | { type: 'tap'; square: string }
  | { type: 'move'; uci: string }
  | { type: 'hint' }
  | { type: 'advance' }
  | { type: 'replied' }
  | { type: 'continue' };

export function initialState(ctx: FlowContext): FlowState {
  return {
    phase: 'spot',
    turn: ctx.turnIndex,
    tries: 0,
    hint: 0,
    answered: false,
    next: null,
    spotUp: null,
    picked: null,
    outcomes: [],
    alt: false,
    hinted: false,
    missedUci: null,
    missedTurn: null,
    feedback: null,
  };
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
export function holdTurns({ game, turnIndex, depth }: FlowContext): number[] {
  const turns: number[] = [];
  for (let i = turnIndex + 1; turns.length < HOLD_MOVES[depth]; i++) {
    const next = game.turns[i];
    if (!next || next.ply !== game.turns[i - 1].ply + 2) break;
    if (depth === 5 && next.label === 'nothing') break;
    turns.push(i);
  }
  return turns;
}

/** Every step this pause asks, in order. */
export function plannedSteps(ctx: FlowContext): StepName[] {
  if (ctx.type === 'nothing') return ['spot'];
  const steps: StepName[] = ['spot'];
  if (ctx.depth >= 2) steps.push('find');
  if (ctx.depth >= 3) steps.push('solve');
  return [...steps, ...holdTurns(ctx).map((): StepName => 'hold')];
}

export function stars(outcomes: StepOutcome[]): number {
  return outcomes.filter((o) => o.correct).length;
}

/** Steps the sheet counts in its header: Notice, Point, Play. The play-out belongs to the last one. */
export function stepTotal(ctx: FlowContext): number {
  return ctx.type === 'nothing' ? 1 : Math.min(ctx.depth, 3);
}

/** Which counted step a phase belongs to; the reveal is not a step. */
export function stepNumber(phase: Phase): number | null {
  switch (phase) {
    case 'spot':
      return 1;
    case 'find':
      return 2;
    case 'solve':
    case 'hold':
    case 'reply':
      return 3;
    default:
      return null;
  }
}

/** Turn whose lines the reveal shows: where the user went wrong, else the pause itself. */
export function revealTurn(ctx: FlowContext, state: FlowState): number {
  return state.missedTurn ?? ctx.turnIndex;
}

/** The sheet hands the board back on the pause position, so the game resumes at the scripted move there. */
export function flowResult(ctx: FlowContext, state: FlowState) {
  return { outcomes: state.outcomes, resumePly: ctx.game.turns[ctx.turnIndex].ply };
}

export function flowReducer(ctx: FlowContext, state: FlowState, event: FlowEvent): FlowState {
  switch (event.type) {
    case 'spot':
      return state.phase === 'spot' && !state.answered ? answerSpot(ctx, state, event.up) : state;
    case 'tap':
      return state.phase === 'find' && !state.answered ? tapSquare(ctx, state, event.square) : state;
    case 'move':
      return playMove(ctx, state, event.uci);
    case 'hint':
      return takeHint(state);
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

/** A failed step ends the pause: the steps it would still have asked count as missed. */
function failRest(ctx: FlowContext, outcomes: StepOutcome[]): StepOutcome[] {
  const rest = plannedSteps(ctx).slice(outcomes.length);
  return [...outcomes, ...rest.map((step) => ({ step, correct: false }))];
}

/** Help that comes by itself: the first after two wrong answers, the second after three. */
function autoHint(state: FlowState, tries: number, top: HintLevel): HintLevel {
  return Math.max(state.hint, Math.min(top, tries - 1)) as HintLevel;
}

/** A wrong answer that keeps the question open; it may bring a hint by itself. */
function missOnce(state: FlowState, feedback: Feedback, top: HintLevel, patch: Partial<FlowState> = {}): FlowState {
  const tries = state.tries + 1;
  const hint = autoHint(state, tries, top);
  return { ...state, ...patch, tries, hint, hinted: state.hinted || hint > 0, feedback };
}

function answerSpot(ctx: FlowContext, state: FlowState, up: boolean): FlowState {
  const correct = up === (ctx.type === 'pause');
  const outcomes: StepOutcome[] = [...state.outcomes, { step: 'spot', correct }];
  const continues = correct && ctx.type === 'pause' && ctx.depth >= 2;
  const next = continues ? 'find' : 'reveal';
  return settle(state, correct ? outcomes : failRest(ctx, outcomes), next, { kind: 'spot', correct }, { spotUp: up });
}

function tapSquare(ctx: FlowContext, state: FlowState, square: string): FlowState {
  if (!ctx.game.turns[state.turn].keySquares.includes(square)) {
    return missOnce(state, { kind: 'find', correct: false, square }, 1);
  }
  const outcomes: StepOutcome[] = [...state.outcomes, { step: 'find', correct: state.hint === 0 }];
  const next = ctx.depth >= 3 ? 'solve' : 'reveal';
  return settle(state, outcomes, next, { kind: 'find', correct: true, square }, { picked: square });
}

function takeHint(state: FlowState): FlowState {
  const top = state.phase === 'find' ? 1 : 2;
  const asking = state.phase === 'find' || state.phase === 'solve' || state.phase === 'hold';
  if (!asking || state.answered || state.hint >= top) return state;
  return { ...state, hint: (state.hint + 1) as HintLevel, hinted: true };
}

function playMove(ctx: FlowContext, state: FlowState, uci: string): FlowState {
  if (state.answered || (state.phase !== 'solve' && state.phase !== 'hold')) return state;

  const step = state.phase;
  const grade = ctx.game.turns[state.turn].grades[uci];
  const outcomes: StepOutcome[] = [...state.outcomes, { step, correct: state.hint === 0 }];

  if (uci === scriptedUci(ctx.game, state.turn)) {
    const last = holdTurns(ctx).at(-1) ?? ctx.turnIndex;
    const next = state.turn < last ? 'reply' : 'reveal';
    return settle(state, outcomes, next, { kind: 'move', uci, turn: state.turn });
  }
  // With the move already drawn on the board, only that move counts.
  if (state.hint < 2 && grade !== undefined && grade <= HOLD_MAX) {
    return settle(state, outcomes, 'reveal', { kind: 'alt', uci }, { alt: true });
  }
  if (step === 'hold' && state.hint === 0 && grade !== undefined && grade >= BLUNDER_MIN) {
    const missed = failRest(ctx, [...state.outcomes, { step, correct: false }]);
    const patch = { missedUci: uci, missedTurn: state.turn, hinted: false };
    return settle(state, missed, 'reveal', { kind: 'wrong', uci }, patch);
  }
  const first = state.missedUci ? {} : { missedUci: uci, missedTurn: state.turn };
  return missOnce(state, { kind: 'wrong', uci }, 2, first);
}

function advance(state: FlowState): FlowState {
  if (!state.answered || !state.next) return state;
  return { ...state, phase: state.next, next: null, answered: false, tries: 0, hint: 0, feedback: null };
}
