import { Chess } from 'chess.js';
import type { Side } from '../content/types';

export interface UciMove {
  from: string;
  to: string;
  promotion?: string;
}

export function parseUci(uci: string): UciMove {
  return { from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] };
}

export function toUci(move: UciMove): string {
  return `${move.from}${move.to}${move.promotion ?? ''}`;
}

/** Plays a SAN move on the board and returns it as uci. */
export function playSan(chess: Chess, san: string): string {
  return toUci(chess.move(san));
}

export function sanToUci(fen: string, san: string): string {
  return playSan(new Chess(fen), san);
}

export function uciToSan(fen: string, uci: string): string {
  return new Chess(fen).move(parseUci(uci)).san;
}

/** The placement field of a FEN: enough to tell whether two boards look the same. */
export function placement(fen: string): string {
  return fen.split(' ')[0];
}

/** The same position with `side` to move, so legal moves can be listed for either colour. */
export function withTurn(fen: string, side: Side): string {
  const fields = fen.split(' ');
  if (fields[1] === side) return fen;
  fields[1] = side;
  fields[3] = '-';
  return fields.join(' ');
}
