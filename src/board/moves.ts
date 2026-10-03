import { Chess, type Move, type Square } from 'chess.js';
import type { Side } from '../content/types';
import { withTurn } from '../game/position';

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
