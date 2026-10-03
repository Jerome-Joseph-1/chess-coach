import { Chess, type Move, type PieceSymbol, type Square } from 'chess.js';
import type { Side } from '../content/types';
import { toUci, withTurn } from '../game/position';
import type { MovedPiece } from './types';

/** Legal moves of the piece on `square`, as if it were `side`'s turn. */
export function legalMoves(fen: string, side: Side, square: string): Move[] {
  try {
    return new Chess(withTurn(fen, side)).moves({ verbose: true, square: square as Square });
  } catch {
    return [];
  }
}

/** The move from the first square to the second, queening when it promotes. */
export function pickMove(moves: Move[], to: string): Move | undefined {
  const candidates = moves.filter((m) => m.to === to);
  return candidates.find((m) => m.promotion === 'q') ?? candidates[0];
}

/** The one legal move that turns `from` into `to`; null when there is none or the pieces could get there two ways. */
export function moveBetween(from: string, to: string): Move | null {
  try {
    const target = to.split(' ')[0];
    const reaching = new Chess(from).moves({ verbose: true }).filter((m) => m.after.split(' ')[0] === target);
    return reaching.length === 1 ? reaching[0] : null;
  } catch {
    return null;
  }
}

/** One move between two positions, played forward or taken back. */
export function stepBetween(from: string, to: string): { move: Move; undo: boolean } | null {
  const forward = moveBetween(from, to);
  if (forward) return { move: forward, undo: false };
  const back = moveBetween(to, from);
  return back ? { move: back, undo: true } : null;
}

/** The square of the piece a move takes, which differs from where it lands for en passant. */
export function capturedSquare(move: Pick<Move, 'from' | 'to' | 'flags' | 'captured'>): string | null {
  if (!move.captured) return null;
  return move.flags.includes('e') ? `${move.to[0]}${move.from[1]}` : move.to;
}

/** The king of the side to move when it stands in check. */
export function checkedKing(fen: string): string | null {
  try {
    const chess = new Chess(fen);
    if (!chess.inCheck()) return null;
    const king = chess.board().flat().find((piece) => piece?.type === 'k' && piece.color === chess.turn());
    return king?.square ?? null;
  } catch {
    return null;
  }
}

/** What the board tells its listeners about a move it shows; taking a move back reports that move with `undo`. */
export function movedPiece(move: Move, undo = false): MovedPiece {
  const captured = move.captured ? { type: move.captured as Exclude<PieceSymbol, 'k'>, color: other(move.color) } : null;
  const check = checkedKing(undo ? move.before : move.after) !== null;
  return undo ? { uci: toUci(move), captured, check, undo } : { uci: toUci(move), captured, check };
}

function other(side: Side): Side {
  return side === 'w' ? 'b' : 'w';
}
