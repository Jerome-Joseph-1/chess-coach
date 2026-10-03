import { describe, expect, it } from 'vitest';
import { material, materialChange, pieceValue } from './material';
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

describe('pieceValue', () => {
  it('knows the usual values for either colour and none for the king', () => {
    expect(['p', 'N', 'b', 'R', 'q', 'k'].map(pieceValue)).toEqual([1, 3, 3, 5, 9, 0]);
  });
});

describe('materialChange', () => {
  const afterNxe5 = 'rnbqkbnr/pppp1ppp/8/4N3/8/8/PPPPPPPP/RNBQKB1R b KQkq - 0 2';
  const afterNxe5Nxe5 = 'rnbqkb1r/pppp1ppp/8/4n3/8/8/PPPPPPPP/RNBQKB1R w KQkq - 0 3';

  it('measures from where the line started, for the side asked', () => {
    expect(materialChange(START, afterNxe5, 'w')).toBe(1);
    expect(materialChange(START, afterNxe5, 'b')).toBe(-1);
    expect(materialChange(START, afterNxe5Nxe5, 'w')).toBe(-2);
  });

  it('is zero where the line began', () => {
    expect(materialChange(START, START, 'w')).toBe(0);
  });
});
