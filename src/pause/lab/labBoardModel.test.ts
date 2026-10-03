import { describe, expect, it } from 'vitest';
import { cellOf, legalTargets, parsePieces, reconcile, squareAtCell } from './labBoardModel';

const START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
const AFTER_E4 = 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1';
const AFTER_E4_D5_EXD5 = 'rnbqkbnr/ppp1pppp/8/3P4/8/8/PPPP1PPP/RNBQKBNR b KQkq - 0 2';

function counter() {
  let n = 100;
  return () => n++;
}

describe('parsePieces', () => {
  it('reads colour, piece and square', () => {
    const pieces = parsePieces(START);
    expect(pieces).toHaveLength(32);
    expect(pieces).toContainEqual({ type: 'wk', square: 'e1' });
    expect(pieces).toContainEqual({ type: 'bq', square: 'd8' });
  });
});

describe('reconcile', () => {
  const start = reconcile([], START, counter());

  it('keeps the identity of a piece that moved, so it can glide', () => {
    const e2 = start.find((p) => p.square === 'e2')!;
    const next = reconcile(start, AFTER_E4, counter());
    expect(next.find((p) => p.id === e2.id)?.square).toBe('e4');
    expect(next).toHaveLength(32);
  });

  it('marks a taken piece as leaving rather than dropping it', () => {
    const afterE4 = reconcile(start, AFTER_E4, counter());
    const d7 = afterE4.find((p) => p.square === 'd7')!;
    const afterTake = reconcile(reconcile(afterE4, 'rnbqkbnr/ppp1pppp/8/3p4/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2', counter()), AFTER_E4_D5_EXD5, counter());
    expect(afterTake.filter((p) => p.leaving)).toHaveLength(1);
    expect(afterTake.find((p) => p.id === d7.id)?.leaving).toBe(true);
  });

  it('adds a new id for a piece that has no counterpart, such as a promotion', () => {
    const next = reconcile([], '4k3/8/8/8/8/8/8/Q3K3 w - - 0 1', counter());
    expect(next.map((p) => p.id)).toEqual([100, 101, 102]);
  });
});

describe('board geometry', () => {
  it('puts a1 bottom-left for White and top-right for Black', () => {
    expect(cellOf('a1', 'w')).toEqual({ col: 0, row: 7 });
    expect(cellOf('a1', 'b')).toEqual({ col: 7, row: 0 });
  });

  it('round-trips squares and cells', () => {
    for (const orientation of ['w', 'b'] as const) {
      for (const square of ['a1', 'e4', 'h8', 'c6']) {
        const { col, row } = cellOf(square, orientation);
        expect(squareAtCell(col, row, orientation)).toBe(square);
      }
    }
  });
});

describe('legalTargets', () => {
  it('lists where a piece can go and nothing for an empty square', () => {
    expect(legalTargets(START, 'e2').sort()).toEqual(['e3', 'e4']);
    expect(legalTargets(START, 'e4')).toEqual([]);
  });
});
