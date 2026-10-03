import type { Side } from '../content/types';
import { formatSigned } from '../ui/RollingNumber';

const VALUES: Record<string, number> = { p: 1, n: 3, b: 3, r: 5, q: 9 };

/** Material balance from `side`'s view: positive when that side is ahead. */
export function material(fen: string, side: Side): number {
  let balance = 0;
  for (const char of fen.split(' ')[0]) {
    const value = VALUES[char.toLowerCase()];
    if (!value) continue;
    const isWhite = char === char.toUpperCase();
    balance += isWhite === (side === 'w') ? value : -value;
  }
  return balance;
}

/** The chip beside the caption: a bare "Material level", or the lead as "+1" / "−2". */
export function materialLabel(balance: number): string {
  return balance === 0 ? 'Material level' : formatSigned(balance);
}
