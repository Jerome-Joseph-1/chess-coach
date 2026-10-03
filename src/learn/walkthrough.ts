import type { Square } from 'chess.js';
import type { ArrowTone, Tone } from '../board/types';
import type { Game } from '../content/types';

/** One step of a worked example: a position, what to look at on it, and what the coach says. */
export interface Beat {
  fen: string;
  /** The move that led to `fen` from the previous beat, as uci, so the board can slide it. */
  move?: string;
  text: string;
  marks: { square: Square; tone: Tone }[];
  arrows: { from: Square; to: Square; tone: ArrowTone }[];
  /** Set when the user should play this beat's next move on the board, e.g. "Your move: take the knight." */
  ask?: string;
}

/** The worked example of a key position, step by step, ending on the line that follows. */
export function walkthrough(_game: Game, _turnIndex: number): Beat[] {
  return [];
}
