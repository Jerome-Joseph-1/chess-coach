import { describe, expect, it } from 'vitest';
import { material, materialLabel } from './material';
import { italian1, italian2 } from './testGames';

const START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

describe('material', () => {
  it('is level at the start', () => {
    expect(material(START, 'w')).toBe(0);
    expect(material(START, 'b')).toBe(0);
  });

  it('counts pawn 1, knight and bishop 3, rook 5, queen 9 from the given side', () => {
    const whiteUpAQueen = 'rnb1kbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
    expect(material(whiteUpAQueen, 'w')).toBe(9);
    expect(material(whiteUpAQueen, 'b')).toBe(-9);
    const blackDownARookAndPawn = 'rnbqkbn1/ppppppp1/8/8/8/8/PPPPPPPP/RNBQKBNR w KQq - 0 1';
    expect(material(blackDownARookAndPawn, 'w')).toBe(6);
  });

  it('agrees with the balance recorded on every fixture turn', () => {
    for (const game of [italian1, italian2]) {
      for (const turn of game.turns) expect(material(turn.fen, game.side)).toBe(turn.material);
    }
  });
});

describe('materialLabel', () => {
  it('says level when nothing separates the sides, else the signed lead', () => {
    expect([0, 1, -2].map(materialLabel)).toEqual(['Material level', '+1', '−2']);
  });
});
