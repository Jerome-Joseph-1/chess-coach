import { Chess, type Move } from 'chess.js';
import { parseUci } from '../game/position';
import type { MoveSound } from '../ui/sound';
import { moveBetween } from './moves';

/** Which knock a move makes; checks win over promotions, castling and captures. */
export function soundForMove(move: Pick<Move, 'san' | 'flags' | 'promotion' | 'captured'>): MoveSound {
  if (move.san.includes('+') || move.san.includes('#')) return 'check';
  if (move.promotion) return 'promote';
  if (move.flags.includes('k') || move.flags.includes('q')) return 'castle';
  if (move.captured) return 'capture';
  return 'piece';
}

/** The knock for a uci move played from `fen`; null when the move is not legal there. */
export function soundForUci(fen: string, uci: string): MoveSound | null {
  try {
    return soundForMove(new Chess(fen).move(parseUci(uci)));
  } catch {
    return null;
  }
}

/**
 * The knock for going from one position to another when that is exactly one legal move,
 * so jumps across several moves stay silent.
 */
export function soundBetween(from: string, to: string): MoveSound | null {
  const move = moveBetween(from, to);
  return move ? soundForMove(move) : null;
}
