import type { Side } from '../content/types';

export type Tone = 'focus' | 'good' | 'bad' | 'hint';

/** Imperative handle to the board. Implemented by Board.tsx, used by the game session and the pause sheet. */
export interface BoardController {
  /** Show a position; animates the change when animate is true. */
  setPosition(fen: string, animate?: boolean): Promise<void>;
  /** Animate one legal move (uci) from the current position. */
  playMove(uci: string): Promise<void>;
  /** Current position. */
  fen(): string;
  highlight(squares: string[], tone: Tone): void;
  clearHighlights(): void;
  /** Mark the last move squares. */
  setLastMove(uci: string | null): void;
  /**
   * Let the user move pieces of `side`. The callback decides: return true to keep the move,
   * false to snap the piece back. Only legal moves reach the callback.
   */
  enableMoves(side: Side, onMove: (uci: string) => boolean | Promise<boolean>): void;
  /** Let the user tap any square (used by the "Where?" step). */
  enableSquareTaps(onTap: (square: string) => void): void;
  disableInput(): void;
  /** Viewport coordinates of a square's centre, for confetti and toasts. */
  squareCenter(square: string): { x: number; y: number };
  /** Dim the board except the given squares (empty array removes the dim). */
  dim(except: string[] | null): void;
}
