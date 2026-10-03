import type { Color, PieceSymbol } from 'chess.js';

type Counted = Exclude<PieceSymbol, 'k'>;

const VALUE: Record<Counted, number> = { q: 9, r: 5, b: 3, n: 3, p: 1 };
/** Biggest first, the order captured pieces are listed in. */
const BY_VALUE: Counted[] = ['q', 'r', 'b', 'n', 'p'];
const START_COUNT: Record<Counted, number> = { q: 1, r: 2, b: 2, n: 2, p: 8 };

function countPieces(fen: string, color: Color): Record<Counted, number> {
  const counts = { q: 0, r: 0, b: 0, n: 0, p: 0 };
  for (const letter of fen.split(' ')[0]) {
    const type = letter.toLowerCase() as PieceSymbol;
    const isWhite = letter === letter.toUpperCase();
    if (type !== 'k' && type in counts && isWhite === (color === 'w')) counts[type]++;
  }
  return counts;
}

/** Pieces of `color` that are no longer on the board, biggest first. */
export function lostPieces(fen: string, color: Color): PieceSymbol[] {
  const counts = countPieces(fen, color);
  return BY_VALUE.flatMap((type) => Array<PieceSymbol>(Math.max(0, START_COUNT[type] - counts[type])).fill(type));
}

/** Material `color` has on the board minus its opponent's, in pawns. */
export function materialLead(fen: string, color: Color): number {
  const total = (side: Color) => {
    const counts = countPieces(fen, side);
    return BY_VALUE.reduce((sum, type) => sum + VALUE[type] * counts[type], 0);
  };
  return total(color) - total(color === 'w' ? 'b' : 'w');
}
