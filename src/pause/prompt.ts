import type { Game } from '../content/types';
import { lessonFor } from '../learn';
import { COPY, findNote, holdSub, replySub, spotSub } from './copy';
import type { FlowState } from './flow';

export interface Prompt {
  title: string;
  sub: string;
  /** The sub line confirms a right answer. */
  right: boolean;
}

const RIGHT = { sub: COPY.right, right: true };

/** What the last answer earned, as the line that replaces the question's sub line. */
function feedbackSub(game: Game, state: FlowState): Pick<Prompt, 'sub' | 'right'> | null {
  const feedback = state.feedback;
  switch (feedback?.kind) {
    case 'spot':
      return feedback.correct ? RIGHT : { sub: COPY.lookAgain, right: false };
    case 'move': {
      const rare = state.phase === 'solve' && state.hint === 0;
      return { sub: rare ? findNote(game.turns[feedback.turn], game.level) : COPY.right, right: true };
    }
    case 'alt':
      return { sub: COPY.altNote, right: true };
    case 'wrong':
      return state.hint ? null : { sub: COPY.tryAgain, right: false };
    default:
      return null;
  }
}

/** What the hint in hand says: the pattern to look for, then which piece, then the move itself. */
function hintSub(game: Game, state: FlowState): Pick<Prompt, 'sub' | 'right'> | null {
  if (state.hint === 0) return null;
  const subs = [lessonFor(game, state.turn).hint, COPY.hintPiece, COPY.hintMove];
  return { sub: subs[state.hint - 1], right: false };
}

function questionFor(game: Game, state: FlowState): Pick<Prompt, 'title' | 'sub'> {
  switch (state.phase) {
    case 'hold':
      return { title: COPY.holdTitle, sub: holdSub(game) };
    case 'reply':
      return { title: COPY.holdTitle, sub: replySub(game) };
    default:
      return { title: COPY.solveTitle, sub: COPY.solveSub };
  }
}

/** Title and sub line of the steps that play on the board. */
export function promptFor(game: Game, state: FlowState): Prompt {
  const question = questionFor(game, state);
  return { ...question, right: false, ...(feedbackSub(game, state) ?? hintSub(game, state)) };
}

/** Sub line of the spot step: what just happened, then how the answer went. */
export function spotPromptFor(game: Game, turnIndex: number, state: FlowState): Pick<Prompt, 'sub' | 'right'> {
  return feedbackSub(game, state) ?? { sub: spotSub(game, turnIndex), right: false };
}

/** The label of the hint button under a question that plays on the board: Hint, Show the piece, Show the move, then none. */
export function hintLabel(state: FlowState): string | null {
  if (state.phase !== 'solve' && state.phase !== 'hold') return null;
  return [COPY.hint, COPY.showPiece, COPY.showMove, null][state.hint];
}
