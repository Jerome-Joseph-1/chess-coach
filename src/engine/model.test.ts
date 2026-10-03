import { describe, expect, it } from 'vitest';
import { fenAfter } from '../pause/position';
import type { Line } from './engine';
import { barScoreAt, endingOf, finishedLines, lineOf, nextToAnalyse, noteAt, referenceAt, rowsAt, verdictAt, type Lookup } from './model';
import type { Score } from './score';

const line = (pv: string[], score: Score): Line => ({ pv, score, depth: 18 });

// Black to move; the knight on d6 hits the rook on e8, which the bishop on d7 guards.
const FEN = '4r1k1/3b1ppp/3N4/8/8/8/5PPP/6K1 b - - 0 21';
const LINES = [
  line(['e8e6', 'd6b5', 'g8f8'], { cp: -40 }),
  line(['e8f8', 'd6b7', 'd7e6'], { cp: -55 }),
  line(['e8a8', 'd6b7', 'd7e6'], { cp: -70 }),
];
const H6 = fenAfter(FEN, ['h7h6']);

function lookupOf(entries: [string, Line[]][]): Lookup {
  const known = new Map(entries);
  return (fen) => known.get(fen) ?? finishedLines(fen) ?? undefined;
}

describe('lineOf', () => {
  it('uses the engine’s own line when it listed the move', () => {
    expect(lineOf(lookupOf([[FEN, LINES]]), FEN, 'e8f8')).toBe(LINES[1]);
  });

  it('builds the line from the best answer after the move otherwise, scored for the mover', () => {
    const lookup = lookupOf([[H6, [line(['d6e8', 'd7e8'], { cp: 220 })]]]);
    expect(lineOf(lookup, FEN, 'h7h6')).toEqual(line(['h7h6', 'd6e8', 'd7e8'], { cp: -220 }));
  });

  it('is null until the engine has looked', () => {
    expect(lineOf(lookupOf([]), FEN, 'h7h6')).toBeNull();
  });

  it('scores a mating move from the finished position, without the engine', () => {
    const backRank = '6k1/5ppp/8/8/8/8/5PPP/3R2K1 w - - 0 40';
    expect(lineOf(lookupOf([]), backRank, 'd1d8')).toEqual({ pv: ['d1d8'], score: { mate: 1 }, depth: 0 });
  });
});

describe('referenceAt and rowsAt', () => {
  it('measure against the engine’s best where the line has no move', () => {
    const lookup = lookupOf([[FEN, LINES]]);
    expect(referenceAt(lookup, FEN)).toEqual({ line: LINES[0], isPlayed: false });
    expect(rowsAt(lookup, FEN, referenceAt(lookup, FEN)).map((row) => [row.san, row.score])).toEqual([
      ['Re6', 'Best'],
      ['Rf8', '−0.2'],
      ['Ra8', '−0.3'],
    ]);
  });

  it('measure against the line’s move where it has one, even when the engine did not list it', () => {
    const lineMove = { fen: FEN, uci: 'h7h6' };
    const lookup = lookupOf([
      [FEN, LINES],
      [H6, [line(['d6e8', 'd7e8', 'g2g3', 'g8h7'], { cp: 220 })]],
    ]);
    const reference = referenceAt(lookup, FEN, lineMove);
    expect(reference?.isPlayed).toBe(true);
    const rows = rowsAt(lookup, FEN, reference);
    expect(rows.map((row) => [row.san, row.score])).toEqual([
      ['h6', 'Played'],
      ['Re6', '+1.8'],
      ['Rf8', '+1.7'],
    ]);
    expect(noteAt(lookup, lineMove)).toBe('The engine prefers Re6 here, by 1.8.');
  });

  it('have nothing for a finished game', () => {
    const mated = '3R2k1/5ppp/8/8/8/8/5PPP/6K1 b - - 1 40';
    const lookup = lookupOf([]);
    expect(referenceAt(lookup, mated)).toBeNull();
    expect(rowsAt(lookup, mated, null)).toEqual([]);
  });
});

describe('verdictAt', () => {
  it('compares the try with the engine’s best before it', () => {
    const lookup = lookupOf([
      [FEN, LINES],
      [H6, [line(['d6e8', 'd7e8', 'g2g3', 'g8h7'], { cp: 220 })]],
    ]);
    expect(verdictAt(lookup, FEN, 'h7h6')).toBe('21… h6 is 1.8 worse than Re6: it loses the exchange after Nxe8 Bxe8.');
  });

  it('compares with the line’s move at the position the line plays it', () => {
    const lookup = lookupOf([
      [FEN, LINES],
      [fenAfter(FEN, ['e8f8']), [line(['d6b7'], { cp: 55 })]],
    ]);
    expect(verdictAt(lookup, FEN, 'e8e6', { fen: FEN, uci: 'e8f8' })).toBe('21… Re6 is about as good as Rf8.');
    expect(verdictAt(lookup, FEN, 'e8f8', { fen: FEN, uci: 'e8f8' })).toBe('21… Rf8 is the move in the line.');
  });
});

describe('barScoreAt', () => {
  it('turns the best score to White’s side', () => {
    expect(barScoreAt(lookupOf([[FEN, LINES]]), FEN)).toEqual({ cp: 40 });
  });

  it('shows a finished game as won or level', () => {
    expect(barScoreAt(lookupOf([]), '3R2k1/5ppp/8/8/8/8/5PPP/6K1 b - - 1 40')).toEqual({ winner: 'w' });
    expect(barScoreAt(lookupOf([]), '7k/5Q2/6K1/8/8/8/8/8 b - - 0 1')).toEqual({ cp: 0 });
    expect(endingOf('7k/5Q2/6K1/8/8/8/8/8 b - - 0 1')).toBe('stalemate');
  });
});

describe('nextToAnalyse', () => {
  it('asks for the position on show first, then the one before the last move', () => {
    const after = fenAfter(FEN, ['e8e6']);
    expect(nextToAnalyse(lookupOf([]), after, FEN)).toBe(after);
    expect(nextToAnalyse(lookupOf([[after, LINES]]), after, FEN)).toBe(FEN);
    expect(nextToAnalyse(lookupOf([[after, LINES], [FEN, LINES]]), after, FEN)).toBeNull();
  });

  it('asks for the position after the line’s move when the engine did not list it', () => {
    const lineMove = { fen: FEN, uci: 'h7h6' };
    expect(nextToAnalyse(lookupOf([[FEN, LINES]]), FEN, null, lineMove)).toBe(H6);
    expect(nextToAnalyse(lookupOf([[FEN, LINES]]), FEN, null, { fen: FEN, uci: 'e8f8' })).toBeNull();
  });

  it('never asks about a finished game', () => {
    expect(nextToAnalyse(lookupOf([]), '3R2k1/5ppp/8/8/8/8/5PPP/6K1 b - - 1 40', null)).toBeNull();
  });
});
