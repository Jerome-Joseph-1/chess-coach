import type { Game } from '../content/types';
import { lessonFor } from '../learn';
import { COPY, findNote, holdSub, replySub, spotSub } from './copy';
import type { FlowState } from './flow';
import { pieceInTrouble } from './hints';

/** How the coach's bubble reads: a question, a hint, an error to try again, a right answer, or neither. */
export type CoachTone = 'neutral' | 'hint' | 'error' | 'success' | 'quiet';

export interface Prompt {
  title: string;
  sub: string;
  tone: CoachTone;
}

type Line = Pick<Prompt, 'sub' | 'tone'>;

const RIGHT: Line = { sub: COPY.right, tone: 'success' };

/** What the last answer earned, as the line that replaces the question's sub line. */
function feedbackLine(game: Game, state: FlowState): Line | null {
  const feedback = state.feedback;
  switch (feedback?.kind) {
    case 'spot':
      return feedback.correct ? RIGHT : { sub: COPY.lookAgain, tone: 'error' };
    case 'move': {
      const rare = state.phase === 'solve' && state.hint === 0;
      return { sub: rare ? findNote(game.turns[feedback.turn], game.level) : COPY.right, tone: 'success' };
    }
    case 'alt':
      return { sub: COPY.altNote, tone: 'success' };
    case 'wrong':
      // A hint that points at the board stays in view; the bubble only turns to the error tone.
      return { sub: state.hint >= 2 ? hintText(game, state)!.sub! : COPY.tryAgain, tone: 'error' };
    default:
      return null;
  }
}

const isFollowUp = (state: FlowState) => state.phase === 'hold' || state.phase === 'reply';

/**
 * What the hints in hand say. On the play step: the pattern becomes the title, then the line names the piece in
 * trouble, then asks for the move drawn on the board. A follow-up move starts at the piece to move.
 */
function hintText(game: Game, state: FlowState): Partial<Prompt> | null {
  if (state.hint === 0) return null;
  if (isFollowUp(state)) return { sub: state.hint >= 3 ? COPY.hintMove : COPY.hintPiece };
  const trouble = pieceInTrouble(game, state.turn)?.text;
  const subs = [COPY.solveSub, trouble ?? COPY.hintPiece, trouble ? `${trouble} ${COPY.hintMove}` : COPY.hintMove];
  return { title: lessonFor(game, state.turn).hint, sub: subs[state.hint - 1] };
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

/** Title, line and tone of the steps that play on the board. */
export function promptFor(game: Game, state: FlowState): Prompt {
  const asked: Prompt = { ...questionFor(game, state), tone: 'neutral' };
  const hinted = hintText(game, state);
  const withHint: Prompt = hinted ? { ...asked, ...hinted, tone: 'hint' } : asked;
  return { ...withHint, ...feedbackLine(game, state) };
}

/** Line of the spot step: what just happened, then how the answer went. */
export function spotPromptFor(game: Game, turnIndex: number, state: FlowState): Line {
  return feedbackLine(game, state) ?? { sub: spotSub(game, turnIndex), tone: 'neutral' };
}

/** "Key position · Move 7", over every question of a pause. */
export function eyebrowFor(game: Game, turnIndex: number): string {
  return `Key position · Move ${game.turns[turnIndex].moveNo}`;
}
