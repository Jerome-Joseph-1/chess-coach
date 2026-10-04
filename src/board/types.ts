import type { Side } from '../content/types';

export type Tone = 'focus' | 'good' | 'bad' | 'hint';
export type BadgeKind = 'good' | 'bad';
/** What just happened on the board, for things outside it that react to moves (the captured-pieces tray, the move strip). */
export interface MovedPiece {
  uci: string;
  captured: { type: 'p' | 'n' | 'b' | 'r' | 'q'; color: Side } | null;
  /** The side to move now stands in check. */
  check: boolean;
  /** The board stepped back over this move: `captured` is the piece that came back. */
  undo?: boolean;
}
export type ArrowTone = 'best' | 'threat' | 'mistake';
/** A move the rules don't allow: the piece's square, and where it was dropped. */
export type IllegalHandler = (from: string, to: string | null) => void;
/** An evaluation from White's point of view: centipawns, mate in n (negative when Black mates), or a finished game. */
export type BarScore = { cp: number } | { mate: number } | { winner: Side };

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
   * false to snap the piece back. Only legal moves reach the callback. A piece dropped where it can't go,
   * or picked up when it has no move at all (`to` is null), is told to `onIllegal`.
   */
  enableMoves(side: Side, onMove: (uci: string) => boolean | Promise<boolean>, onIllegal?: IllegalHandler): void;
  /** Let the user tap any square (used by the "Where?" step). */
  enableSquareTaps(onTap: (square: string) => void): void;
  disableInput(): void;
  /** Viewport coordinates of a square's centre, for confetti and toasts. */
  squareCenter(square: string): { x: number; y: number };
  /** Dim the board except the given squares (empty array removes the dim). */
  dim(except: string[] | null): void;
  /** A round check or cross on a square, like a puzzle verdict; null removes it. A good one comes with a burst. */
  badge(square: string, kind: BadgeKind | null): void;
  /** Draw a move arrow; it stays until clearArrows. The player's own right-click drawings are separate. */
  arrow(from: string, to: string, tone: ArrowTone): void;
  clearArrows(): void;
  /** A small burst of specks from a square, for a found move; a second one on the same square at once is ignored. */
  burst(square: string): void;
  /** Listens to every move the board animates, steps back included; returns the way to stop listening. */
  onMoved(listener: (move: MovedPiece) => void): () => void;
  /** A thin evaluation bar along the left edge of the board; null hides it. */
  evalBar(score: BarScore | null): void;
}
