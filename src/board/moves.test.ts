import { Chess } from 'chess.js';
import { describe, expect, it } from 'vitest';
import { toUci } from '../game/position';
import { legalMoves, pickMove } from './moves';

const START = new Chess().fen();

describe('legalMoves', () => {
  it('lists the moves of a piece', () => {
    expect(legalMoves(START, 'w', 'g1').map((m) => m.to).sort()).toEqual(['f3', 'h3']);
    expect(legalMoves(START, 'w', 'e4')).toEqual([]);
  });

  it('works for the side that is not on move', () => {
    expect(legalMoves(START, 'b', 'e7').map((m) => m.to).sort()).toEqual(['e5', 'e6']);
  });

  it('is empty for a square of the other colour', () => {
    expect(legalMoves(START, 'w', 'e7')).toEqual([]);
  });

  it('includes castling for the king', () => {
    const fen = 'r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1';
    expect(legalMoves(fen, 'w', 'e1').map((m) => m.to)).toEqual(expect.arrayContaining(['g1', 'c1']));
  });

  it('includes en passant when it is on', () => {
    const fen = 'rnbqkbnr/ppp1pppp/8/8/3pP3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 3';
    expect(legalMoves(fen, 'b', 'd4').map(toUci)).toContain('d4e3');
  });

  it('is empty for a position that cannot be read', () => {
    expect(legalMoves('nonsense', 'w', 'e2')).toEqual([]);
  });
});

describe('pickMove', () => {
  const promotion = '8/P6k/8/8/8/8/8/K7 w - - 0 1';

  it('queens a pawn that reaches the last rank', () => {
    const move = pickMove(legalMoves(promotion, 'w', 'a7'), 'a8');
    expect(toUci(move!)).toBe('a7a8q');
  });

  it('picks the plain move otherwise', () => {
    expect(toUci(pickMove(legalMoves(START, 'w', 'e2'), 'e4')!)).toBe('e2e4');
  });

  it('finds nothing for a square the piece cannot reach', () => {
    expect(pickMove(legalMoves(START, 'w', 'e2'), 'e5')).toBeUndefined();
  });
});
