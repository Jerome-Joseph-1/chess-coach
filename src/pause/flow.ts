import type { Depth, Game, StepName, StepOutcome } from '../content/types';
import { fenAfter, uciOfSan } from './position';

/** A move losing at most this much win% still holds the position. */
export const HOLD_MAX = 2.5;
/** In the play-out, a move losing this much ends it at once. */
export const BLUNDER_MIN = 10;
const MAX_TRIES = 2;
const HOLD_MOVES: Record<Depth, number> = { 1: 0, 2: 0, 3: 0, 4: 1, 5: 5 };

export interface FlowContext {
  game: Game;
  turnIndex: number;
  type: 'pause' | 'nothing';
  depth: Depth;
}

export type Phase = 'spot' | 'find' | 'solve' | 'hold' | 'reply' | 'reveal' | 'guided' | 'done';

/** What the view should react to after an event: sound, confetti, highlights. */
export type Feedback =
  | { kind: 'spot'; correct: boolean }
  | { kind: 'find'; correct: boolean; square: string }
  | { kind: 'hint' }
  | { kind: 'move'; uci: string; turn: number }
  | { kind: 'alt'; uci: string }
  | { kind: 'wrong'; uci: string }
  | { kind: 'guided'; uci: string }
  | { kind: 'gentle' };

export interface FlowState {
  phase: Phase;
  /** Turn whose position is asked, shown or played now; moves on during the play-out. */
  turn: number;
  /** Wrong answers on the current question. */
  tries: number;
  /** The current question is settled and its feedback is on screen until `advance`. */
  answered: boolean;
  /** Where `advance` goes after the feedback. */
  next: Phase | null;
  /** The user's spot answer: true for "Something's up". */
  spotUp: boolean | null;
  /** This attempt's results. */
  outcomes: StepOutcome[];
  /** The first attempt's results, kept when the user tries again. */
  recorded: StepOutcome[] | null;
  attempt: number;
  /** The scripted move at `turn` is on the board, or will be set there (a different but fine move). */
  scriptedDone: boolean;
  alt: boolean;
  /** The losing move that sent the user to the reveal. */
  missedUci: string | null;
  feedback: Feedback | null;
}

export type FlowEvent =
  | { type: 'spot'; up: boolean }
  | { type: 'tap'; square: string }
  | { type: 'move'; uci: string }
  | { type: 'advance' }
  | { type: 'replied' }
  | { type: 'retry' }
  | { type: 'continue' };

export function initialState(ctx: FlowContext): FlowState {
  return {
    phase: 'spot',
    turn: ctx.turnIndex,
    tries: 0,
    answered: false,
    next: null,
    spotUp: null,
    outcomes: [],
    recorded: null,
    attempt: 0,
    scriptedDone: false,
    alt: false,
    missedUci: null,
    feedback: null,
  };
}

export function scriptedUci(game: Game, turnIndex: number): string {
  const turn = game.turns[turnIndex];
  return uciOfSan(turn.fen, game.moves[turn.ply]);
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

/** Turn whose lines the reveal shows: where the user went wrong, else the pause itself. */
export function revealTurn(ctx: FlowContext, state: FlowState): number {
  return state.missedUci ? state.turn : ctx.turnIndex;
}

/** Index in game.moves of the next move to play once everything the sheet showed is on the board. */
export function resumePly(ctx: FlowContext, state: FlowState): number {
  return ctx.type === 'nothing' ? ctx.game.turns[ctx.turnIndex].ply : ctx.game.turns[state.turn].ply + 1;
}

/** Where the board must stand when the sheet hands back. */
export function finalFen(ctx: FlowContext, state: FlowState): string {
  if (ctx.type === 'nothing') return ctx.game.turns[ctx.turnIndex].fen;
  return fenAfter(ctx.game.turns[state.turn].fen, [scriptedUci(ctx.game, state.turn)]);
}

export function flowResult(ctx: FlowContext, state: FlowState) {
  return { outcomes: state.recorded ?? state.outcomes, resumePly: resumePly(ctx, state) };
}

export function flowReducer(ctx: FlowContext, state: FlowState, event: FlowEvent): FlowState {
  switch (event.type) {
    case 'spot':
      return state.phase === 'spot' && !state.answered ? answerSpot(ctx, state, event.up) : state;
    case 'tap':
      return state.phase === 'find' && !state.answered ? tapSquare(ctx, state, event.square) : state;
    case 'move':
      return playMove(ctx, state, event.uci);
    case 'advance':
      return advance(state);
    case 'replied':
      return state.phase === 'reply'
        ? { ...state, phase: 'hold', turn: state.turn + 1, scriptedDone: false, feedback: null }
        : state;
    case 'retry':
      return state.phase === 'reveal' && ctx.type === 'pause'
        ? { ...initialState(ctx), recorded: state.recorded, attempt: state.attempt + 1 }
        : state;
    case 'continue':
      return state.phase === 'reveal' ? leave(ctx, state) : state;
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

function answerSpot(ctx: FlowContext, state: FlowState, up: boolean): FlowState {
  const correct = up === (ctx.type === 'pause');
  const outcomes: StepOutcome[] = [...state.outcomes, { step: 'spot', correct }];
  const continues = correct && ctx.type === 'pause' && ctx.depth >= 2;
  const next = continues ? 'find' : 'reveal';
  return settle(state, correct ? outcomes : failRest(ctx, outcomes), next, { kind: 'spot', correct }, { spotUp: up });
}

function tapSquare(ctx: FlowContext, state: FlowState, square: string): FlowState {
  const after = ctx.depth >= 3 ? 'solve' : 'reveal';
  if (ctx.game.turns[state.turn].keySquares.includes(square)) {
    const outcomes: StepOutcome[] = [...state.outcomes, { step: 'find', correct: true }];
    return settle(state, outcomes, after, { kind: 'find', correct: true, square });
  }
  if (state.tries + 1 < MAX_TRIES) {
    return { ...state, tries: state.tries + 1, feedback: { kind: 'find', correct: false, square } };
  }
  const outcomes: StepOutcome[] = [...state.outcomes, { step: 'find', correct: false }];
  return settle(state, outcomes, after, { kind: 'hint' });
}

function playMove(ctx: FlowContext, state: FlowState, uci: string): FlowState {
  if (state.answered) return state;
  if (state.phase === 'guided') return playGuided(ctx, state, uci);
  if (state.phase !== 'solve' && state.phase !== 'hold') return state;

  const step = state.phase;
  const grade = ctx.game.turns[state.turn].grades[uci];
  const correct: StepOutcome[] = [...state.outcomes, { step, correct: true }];

  if (uci === scriptedUci(ctx.game, state.turn)) {
    const last = holdTurns(ctx).at(-1) ?? ctx.turnIndex;
    const next = state.turn < last ? 'reply' : 'reveal';
    return settle(state, correct, next, { kind: 'move', uci, turn: state.turn }, { scriptedDone: true });
  }
  if (grade !== undefined && grade <= HOLD_MAX) {
    return settle(state, correct, 'reveal', { kind: 'alt', uci }, { scriptedDone: true, alt: true });
  }
  const endsPlayOut = step === 'hold' && grade !== undefined && grade >= BLUNDER_MIN;
  if (!endsPlayOut && state.tries + 1 < MAX_TRIES) {
    return { ...state, tries: state.tries + 1, feedback: { kind: 'wrong', uci } };
  }
  const missed = failRest(ctx, [...state.outcomes, { step, correct: false }]);
  return settle(state, missed, 'reveal', { kind: 'wrong', uci }, { missedUci: uci });
}

function playGuided(ctx: FlowContext, state: FlowState, uci: string): FlowState {
  if (uci !== scriptedUci(ctx.game, state.turn)) return { ...state, feedback: { kind: 'gentle' } };
  return settle(state, state.outcomes, 'done', { kind: 'guided', uci }, { scriptedDone: true });
}

function advance(state: FlowState): FlowState {
  if (!state.answered || !state.next) return state;
  const moved: FlowState = { ...state, phase: state.next, next: null, answered: false, tries: 0, feedback: null };
  return state.next === 'reveal' ? { ...moved, recorded: state.recorded ?? state.outcomes } : moved;
}

function leave(ctx: FlowContext, state: FlowState): FlowState {
  const guided = ctx.type === 'pause' && !state.scriptedDone;
  return { ...state, phase: guided ? 'guided' : 'done', feedback: null };
}
