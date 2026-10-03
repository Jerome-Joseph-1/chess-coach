import { Chess } from 'chess.js';
import { describe, expect, it } from 'vitest';
import { lostPieces, materialLead } from './material';

function after(...sans: string[]): string {
  const chess = new Chess();
  sans.forEach((san) => chess.move(san));
  return chess.fen();
}

describe('lostPieces', () => {
  it('is empty at the start', () => {
    expect(lostPieces(after(), 'w')).toEqual([]);
    expect(lostPieces(after(), 'b')).toEqual([]);
  });

  it('lists what each side has lost, biggest first', () => {
    const fen = after('e4', 'd5', 'exd5', 'Qxd5', 'Nc3', 'Qxd2+', 'Bxd2');
    expect(lostPieces(fen, 'b')).toEqual(['q', 'p']);
    expect(lostPieces(fen, 'w')).toEqual(['p', 'p']);
  });

  it('does not count a promoted piece as extra', () => {
    expect(lostPieces('4k3/P7/8/8/8/8/8/4K3 w - - 0 1', 'b')).toEqual(['q', 'r', 'r', 'b', 'b', 'n', 'n', 'p', 'p', 'p', 'p', 'p', 'p', 'p', 'p']);
    expect(lostPieces('Q3k3/8/8/8/8/8/8/4K3 w - - 0 1', 'w')).toEqual(['r', 'r', 'b', 'b', 'n', 'n', 'p', 'p', 'p', 'p', 'p', 'p', 'p', 'p']);
  });
});

describe('materialLead', () => {
  it('is even at the start', () => {
    expect(materialLead(after(), 'w')).toBe(0);
  });

  it('counts a won pawn for one side and against the other', () => {
    const fen = after('e4', 'd5', 'exd5');
    expect(materialLead(fen, 'w')).toBe(1);
    expect(materialLead(fen, 'b')).toBe(-1);
  });

  it('values pieces 9, 5, 3, 3, 1', () => {
    expect(materialLead('4k3/8/8/8/8/8/8/QRBN1K1P w - - 0 1', 'w')).toBe(9 + 5 + 3 + 3 + 1);
  });
});
