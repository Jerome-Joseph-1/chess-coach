import { describe, expect, it } from 'vitest';
import { gridCell, squareAtPoint } from './geometry';

describe('gridCell', () => {
  it('puts a8 at the top left for white and h1 there for black', () => {
    expect(gridCell('a8', false)).toEqual({ column: 0, row: 0 });
    expect(gridCell('h1', true)).toEqual({ column: 0, row: 0 });
  });

  it('puts h1 at the bottom right for white and a8 there for black', () => {
    expect(gridCell('h1', false)).toEqual({ column: 7, row: 7 });
    expect(gridCell('a8', true)).toEqual({ column: 7, row: 7 });
  });
});

describe('squareAtPoint', () => {
  const rect = { left: 10, top: 20, width: 80 };

  it('finds the square under a point for either side', () => {
    expect(squareAtPoint(15, 25, rect, false)).toBe('a8');
    expect(squareAtPoint(85, 95, rect, false)).toBe('h1');
    expect(squareAtPoint(15, 25, rect, true)).toBe('h1');
    expect(squareAtPoint(85, 95, rect, true)).toBe('a8');
  });

  it('agrees with gridCell', () => {
    const at = (square: string, flipped: boolean) => {
      const { column, row } = gridCell(square, flipped);
      return squareAtPoint(rect.left + (column + 0.5) * 10, rect.top + (row + 0.5) * 10, rect, flipped);
    };
    for (const square of ['a1', 'e4', 'h8', 'c6']) {
      expect(at(square, false)).toBe(square);
      expect(at(square, true)).toBe(square);
    }
  });

  it('is null off the board', () => {
    expect(squareAtPoint(5, 25, rect, false)).toBeNull();
    expect(squareAtPoint(50, 101, rect, false)).toBeNull();
  });
});
