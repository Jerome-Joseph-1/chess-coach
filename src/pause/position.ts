import { Chess } from 'chess.js';
import type { Side } from '../content/types';

export interface PlayedMove {
  uci: string;
  san: string;
  /** Position before and after the move. */
  before: string;
  after: string;
  side: Side;
  /** Piece type taken (p, n, b, r, q), if any. */
  captured: string | null;
}

/** Plays moves from a position; stops at the first one that is illegal. */
export function playLine(fen: string, ucis: string[]): PlayedMove[] {
  const chess = new Chess(fen);
  const played: PlayedMove[] = [];
  for (const uci of ucis) {
    const before = chess.fen();
    try {
      const move = chess.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] });
      played.push({ uci, san: move.san, before, after: chess.fen(), side: move.color, captured: move.captured ?? null });
    } catch {
      break;
    }
  }
  return played;
}

export function sanOf(fen: string, uci: string): string {
  return playLine(fen, [uci])[0]?.san ?? uci;
}

export function uciOfSan(fen: string, san: string): string {
  try {
    const move = new Chess(fen).move(san);
    return move.from + move.to + (move.promotion ?? '');
  } catch {
    return '';
  }
}

export function fenAfter(fen: string, ucis: string[]): string {
  return playLine(fen, ucis).at(-1)?.after ?? fen;
}

/** The position as if the side to move passed, which is how threat lines start. */
export function flipTurn(fen: string): string {
  const fields = fen.split(' ');
  fields[1] = fields[1] === 'w' ? 'b' : 'w';
  fields[3] = '-';
  return fields.join(' ');
}

export function placement(fen: string): string {
  return fen.split(' ')[0];
}

/** Same pieces and same side to move. */
export function samePosition(a: string, b: string): boolean {
  return a.split(' ').slice(0, 2).join(' ') === b.split(' ').slice(0, 2).join(' ');
}

export function squaresOf(uci: string): [string, string] {
  return [uci.slice(0, 2), uci.slice(2, 4)];
}
