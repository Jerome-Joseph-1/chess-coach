import { Chess } from 'chess.js';
import { describe, expect, it } from 'vitest';
import { toUci } from '../game/position';
import { capturedSquare, checkedKing, legalMoves, moveBetween, movedPiece, pickMove, stepBetween } from './moves';

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

describe('moveBetween and stepBetween', () => {
  const afterE4 = 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1';

  it('finds the one move from a position to the next', () => {
    expect(toUci(moveBetween(START, afterE4)!)).toBe('e2e4');
    expect(stepBetween(START, afterE4)).toMatchObject({ move: { from: 'e2', to: 'e4' }, undo: false });
  });

  it('finds a step back as the move it takes back', () => {
    expect(stepBetween(afterE4, START)).toMatchObject({ move: { from: 'e2', to: 'e4' }, undo: true });
  });

  it('finds nothing across two moves or for the same position', () => {
    const afterE4E5 = 'rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq e6 0 2';
    expect(stepBetween(START, afterE4E5)).toBeNull();
    expect(stepBetween(START, START)).toBeNull();
  });
});

describe('capturedSquare', () => {
  it('is where the move lands, or beside it for en passant', () => {
    const exd5 = new Chess('rnbqkbnr/ppp1pppp/8/3p4/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2').move('exd5');
    expect(capturedSquare(exd5)).toBe('d5');
    const enPassant = new Chess('rnbqkbnr/ppp1pppp/8/8/3pP3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 3').move('dxe3');
    expect(capturedSquare(enPassant)).toBe('e4');
    expect(capturedSquare(new Chess().move('e4'))).toBeNull();
  });
});

describe('checkedKing', () => {
  it('names the square of the king in check, for either side', () => {
    expect(checkedKing('rnbqkbnr/ppp2ppp/8/1B1pp3/4P3/8/PPPP1PPP/RNBQK1NR b KQkq - 1 3')).toBe('e8');
    expect(checkedKing('rnb1kbnr/pppp1ppp/8/4p3/6Pq/5P2/PPPPP2P/RNBQKBNR w KQkq - 1 3')).toBe('e1');
    expect(checkedKing(START)).toBeNull();
  });
});

describe('movedPiece', () => {
  it('reports a capture with the colour of the piece taken', () => {
    const move = new Chess('rnbqkbnr/ppp1pppp/8/3p4/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2').move('exd5');
    expect(movedPiece(move)).toEqual({ uci: 'e4d5', captured: { type: 'p', color: 'b' }, check: false });
  });

  it('reports en passant as a pawn taken', () => {
    const move = new Chess('rnbqkbnr/ppp1pppp/8/8/3pP3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 3').move('dxe3');
    expect(movedPiece(move).captured).toEqual({ type: 'p', color: 'w' });
  });

  it('reports a promotion that takes, with the promotion in the uci', () => {
    const move = new Chess('1r5k/P7/8/8/8/8/8/K7 w - - 0 1').move({ from: 'a7', to: 'b8', promotion: 'q' });
    expect(movedPiece(move)).toEqual({ uci: 'a7b8q', captured: { type: 'r', color: 'b' }, check: true });
  });

  it('reports a quiet move and a check', () => {
    expect(movedPiece(new Chess().move('Nf3'))).toEqual({ uci: 'g1f3', captured: null, check: false });
    const check = new Chess('rnbqkbnr/ppp2ppp/8/3pp3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 3').move('Bb5');
    expect(movedPiece(check).check).toBe(true);
  });

  it('marks a move taken back, with check read from the position it goes back to', () => {
    const check = new Chess('rnbqkbnr/ppp2ppp/8/3pp3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 3').move('Bb5');
    expect(movedPiece(check, true)).toEqual({ uci: 'f1b5', captured: null, check: false, undo: true });
    const capture = new Chess('rnbqkbnr/ppp1pppp/8/3p4/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2').move('exd5');
    expect(movedPiece(capture, true).captured).toEqual({ type: 'p', color: 'b' });
  });
});
