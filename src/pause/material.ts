import type { Side } from '../content/types';

const VALUES: Record<string, number> = { p: 1, n: 3, b: 3, r: 5, q: 9 };

/** Pawn 1, knight and bishop 3, rook 5, queen 9; 0 for anything else. */
export function pieceValue(type: string): number {
  return VALUES[type.toLowerCase()] ?? 0;
}

/** Material balance from `side`'s view: positive when that side is ahead. */
export function material(fen: string, side: Side): number {
  let balance = 0;
  for (const char of fen.split(' ')[0]) {
    const value = pieceValue(char);
    if (!value) continue;
    const isWhite = char === char.toUpperCase();
    balance += isWhite === (side === 'w') ? value : -value;
  }
  return balance;
}

/** How much `side` has gained (positive) or lost since the start position of a line. */
export function materialChange(startFen: string, fen: string, side: Side): number {
  return material(fen, side) - material(startFen, side);
}
