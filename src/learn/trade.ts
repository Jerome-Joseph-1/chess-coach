import type { Color, Move, PieceSymbol, Square } from 'chess.js';
import { VALUE } from './board';

/** What one side takes and gives up over a line, after even swaps cancel out. */
export interface Trade {
  /** Pieces taken from the opponent, biggest first. */
  won: PieceSymbol[];
  /** Pieces given up, biggest first. */
  lost: PieceSymbol[];
  /** Net gain in pawns, promotions included. */
  net: number;
  /** Pieces `side` promoted to that are still on the board. */
  promoted: PieceSymbol[];
  /** Line indices of the captures behind `won`, biggest piece first. */
  gains: number[];
}

interface Capture {
  index: number;
  square: Square;
  type: PieceSymbol;
  mine: boolean;
  cancelled: boolean;
}

const MINORS = ['n', 'b'];

const equivalent = (a: PieceSymbol, b: PieceSymbol) => a === b || (MINORS.includes(a) && MINORS.includes(b));

export function capturedSquare(move: Move): Square {
  // En passant takes a pawn that stands beside the destination, not on it.
  return move.isEnPassant() ? (`${move.to[0]}${move.from[1]}` as Square) : move.to;
}

interface Promotion {
  type: PieceSymbol;
  mine: boolean;
}

/** The captures in a line, plus the promoted pieces still standing; a promoted piece taken back counts as a pawn. */
function capturesIn(moves: Move[], side: Color): { captures: Capture[]; promoted: Promotion[] } {
  const promoted = new Map<Square, Promotion>();
  const captures: Capture[] = [];
  moves.forEach((move, index) => {
    const mine = move.color === side;
    if (move.captured) {
      const square = capturedSquare(move);
      const type = promoted.delete(square) ? 'p' : move.captured;
      captures.push({ index, square, type, mine, cancelled: false });
    }
    const carried = promoted.get(move.from);
    if (carried !== undefined) {
      promoted.delete(move.from);
      promoted.set(move.to, carried);
    }
    if (move.promotion) promoted.set(move.to, { type: move.promotion, mine });
  });
  return { captures, promoted: [...promoted.values()] };
}

/** Cancels like-for-like recaptures on the same square, then any remaining like-for-like pairs. */
function cancelSwaps(captures: Capture[]) {
  for (let i = captures.length - 1; i > 0; i--) {
    const [first, second] = [captures[i - 1], captures[i]];
    if (first.cancelled || second.cancelled || second.index !== first.index + 1) continue;
    if (second.square === first.square && equivalent(first.type, second.type)) first.cancelled = second.cancelled = true;
  }
  for (const gain of captures.filter((c) => c.mine && !c.cancelled)) {
    const loss = captures.find((c) => !c.mine && !c.cancelled && c.type === gain.type);
    if (loss) gain.cancelled = loss.cancelled = true;
  }
}

/** What `side` takes and gives up over `moves`. */
export function tradeOf(moves: Move[], side: Color): Trade {
  const { captures, promoted } = capturesIn(moves, side);
  const promotion = promoted.reduce((sum, p) => sum + (p.mine ? 1 : -1) * (VALUE[p.type] - 1), 0);
  cancelSwaps(captures);
  const kept = captures.filter((c) => !c.cancelled);
  const mine = kept.filter((c) => c.mine).sort((a, b) => VALUE[b.type] - VALUE[a.type] || a.index - b.index);
  const theirs = kept.filter((c) => !c.mine).sort((a, b) => VALUE[b.type] - VALUE[a.type]);
  const sum = (list: Capture[]) => list.reduce((total, c) => total + VALUE[c.type], 0);
  return {
    won: mine.map((c) => c.type),
    lost: theirs.map((c) => c.type),
    net: sum(mine) - sum(theirs) + promotion,
    promoted: promoted.filter((p) => p.mine).map((p) => p.type),
    gains: mine.map((c) => c.index),
  };
}
