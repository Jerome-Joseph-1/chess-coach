import type { Side } from '../content/types';
import { materialChange, pieceValue } from './material';
import type { PlayedMove } from './position';

export interface Captures {
  /** Piece types the user's side takes, net of trades. */
  won: string[];
  /** Piece types the opponent takes, net of trades. */
  lost: string[];
}

export const valueOf = (types: string[]) => types.reduce((total, type) => total + pieceValue(type), 0);

/** Takes `taken` off `from` for every piece it matches under `same`; what is left over is returned. */
function crossOff(from: string[], taken: string[], same: (a: string, b: string) => boolean): { rest: string[]; unmatched: string[] } {
  const unmatched = [...taken];
  const rest = from.filter((type) => {
    const at = unmatched.findIndex((other) => same(type, other));
    if (at >= 0) unmatched.splice(at, 1);
    return at < 0;
  });
  return { rest, unmatched };
}

/** What each side takes in a line. A piece for the same piece, or one of equal worth, is a trade, not a gain. */
export function capturesIn(line: PlayedMove[], side: Side): Captures {
  const won: string[] = [];
  const lost: string[] = [];
  for (const move of line) {
    if (move.captured) (move.side === side ? won : lost).push(move.captured);
  }
  const exact = crossOff(won, lost, (a, b) => a === b);
  const equal = crossOff(exact.rest, exact.unmatched, (a, b) => pieceValue(a) === pieceValue(b));
  return { won: equal.rest, lost: equal.unmatched };
}

export interface Loss {
  /** The most valuable piece the user ends up short of. */
  piece: string;
  /** The opponent's move that took it, and where that move stands in the line. */
  san: string;
  at: number;
}

/** What the user loses in a line, or null when the line does not leave the user's material lower. */
export function materialLoss(startFen: string, line: PlayedMove[], side: Side): Loss | null {
  const end = line.at(-1);
  if (!end || materialChange(startFen, end.after, side) >= 0) return null;
  const [piece] = capturesIn(line, side).lost.sort((a, b) => pieceValue(b) - pieceValue(a));
  const at = line.findIndex((move) => move.side !== side && move.captured === piece);
  return piece && at >= 0 ? { piece, san: line[at].san, at } : null;
}
