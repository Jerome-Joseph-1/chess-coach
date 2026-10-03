import type { Game } from '../content/types';
import { COPY, findNote, guidedTitle, holdSub, replySub, spotSub } from './copy';
import type { FlowState, Phase } from './flow';

export interface Prompt {
  title: string;
  sub: string;
  /** The sub line confirms a right answer. */
  right: boolean;
}

const RIGHT = { sub: COPY.right, right: true };
const NOT_QUITE = { sub: COPY.notQuite, right: false };

/** What the last answer earned, as the line that replaces the question's sub line. */
function feedbackSub(game: Game, state: FlowState): Pick<Prompt, 'sub' | 'right'> | null {
  const feedback = state.feedback;
  switch (feedback?.kind) {
    case 'spot':
      return feedback.correct ? RIGHT : NOT_QUITE;
    case 'find':
      return feedback.correct ? RIGHT : { sub: COPY.findRetry, right: false };
    case 'hint':
      return { sub: COPY.findHint, right: false };
    case 'move': {
      const rare = state.phase === 'solve';
      return { sub: rare ? findNote(game.turns[feedback.turn], game.level) : COPY.right, right: true };
    }
    case 'alt':
      return { sub: COPY.altNote, right: true };
    case 'wrong':
      return { sub: state.answered ? COPY.notQuite : COPY.oneMore, right: false };
    case 'guided':
      return RIGHT;
    default:
      return null;
  }
}

function questionFor(game: Game, state: FlowState): Pick<Prompt, 'title' | 'sub'> {
  switch (state.phase) {
    case 'find':
      return { title: COPY.findTitle, sub: COPY.findSub };
    case 'solve':
      return { title: COPY.solveTitle, sub: COPY.solveSub };
    case 'hold':
      return { title: COPY.holdTitle, sub: holdSub(game) };
    case 'reply':
      return { title: COPY.holdTitle, sub: replySub(game) };
    default:
      return { title: guidedTitle(game.moves[game.turns[state.turn].ply]), sub: COPY.solveSub };
  }
}

/** Title and sub line of the steps that play on the board. */
export function promptFor(game: Game, state: FlowState): Prompt {
  const question = questionFor(game, state);
  return { ...question, right: false, ...feedbackSub(game, state) };
}

/** Sub line of the spot step: what just happened, then how the answer went. */
export function spotPromptFor(game: Game, turnIndex: number, state: FlowState): Pick<Prompt, 'sub' | 'right'> {
  return feedbackSub(game, state) ?? { sub: spotSub(game, turnIndex), right: false };
}

/** The way out of a question that plays on the board; none while the opponent answers. */
export function skipLabel(phase: Phase): string | null {
  switch (phase) {
    case 'find':
      return COPY.notSure;
    case 'solve':
    case 'hold':
      return COPY.showAnswer;
    default:
      return null;
  }
}
