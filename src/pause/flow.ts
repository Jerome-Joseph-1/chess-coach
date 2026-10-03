import type { Depth, Game, StepName, StepOutcome } from '../content/types';
import { fenAfter, uciOfSan } from './position';

/** A move losing at most this much win% still holds the position. */
export const HOLD_MAX = 2.5;
/** Follow-up moves asked after the first one: none up to stage 3, one at stage 4, up to five at stage 5. */
const HOLD_MOVES: Record<Depth, number> = { 1: 0, 2: 0, 3: 0, 4: 1, 5: 5 };

export interface FlowContext {
  game: Game;
  turnIndex: number;
  type: 'pause' | 'nothing';
  depth: Depth;
}

export type Phase = 'spot' | 'solve' | 'hold' | 'reply' | 'reveal' | 'done';

/** 0 none yet, 1 the piece is marked, 2 the move is drawn. */
export type HintLevel = 0 | 1 | 2;

/** What the view should react to after an event: sound, confetti, highlights. */
export type Feedback =
  | { kind: 'spot'; correct: boolean }
  | { kind: 'move'; uci: string; turn: number }
  | { kind: 'alt'; uci: string }
  | { kind: 'wrong'; uci: string };

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
  /** The user's latest spot answer: true for "Something's up". */
  spotUp: boolean | null;
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
  | { type: 'spot'; up: boolean }
  | { type: 'move'; uci: string }
  | { type: 'hint' }
  | { type: 'solution' }
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
    outcomes: [],
    alt: false,
    hinted: false,
    wrongUci: null,
    missedTurn: null,
    missedUci: null,
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

/** Every step this pause asks, in order: spot, play, then the follow-up moves of stage 4 and 5. */
export function plannedSteps(ctx: FlowContext): StepName[] {
  if (ctx.type === 'nothing') return ['spot'];
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
  return at < 0 ? null : 2 + at;
}

/** Turn whose lines the reveal shows: where the user asked for the solution, else the pause itself. */
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

/** A wrong answer is only an error: the question stays open and the first answer is what counts. */
function answerSpot(ctx: FlowContext, state: FlowState, up: boolean): FlowState {
  const correct = up === (ctx.type === 'pause');
  if (!correct) return { ...state, spotUp: up, tries: state.tries + 1, feedback: { kind: 'spot', correct } };
  const outcomes: StepOutcome[] = [...state.outcomes, { step: 'spot', correct: state.tries === 0 }];
  return settle(state, outcomes, ctx.type === 'pause' ? 'solve' : 'reveal', { kind: 'spot', correct }, { spotUp: up });
}

function takeHint(state: FlowState): FlowState {
  if (!isAsking(state) || state.hint >= 2) return state;
  return { ...state, hint: (state.hint + 1) as HintLevel, hinted: true };
}

function playMove(ctx: FlowContext, state: FlowState, uci: string): FlowState {
  if (!isAsking(state)) return state;

  const step = state.phase === 'hold' ? 'hold' : 'solve';
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
  return { ...state, tries: state.tries + 1, wrongUci: state.wrongUci ?? uci, feedback: { kind: 'wrong', uci } };
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
