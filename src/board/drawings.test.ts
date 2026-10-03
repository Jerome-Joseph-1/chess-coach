import { describe, expect, it } from 'vitest';
import { colorFor, drawingBetween, toggleDrawing, type Drawing } from './drawings';

const keys = { shiftKey: false, altKey: false, ctrlKey: false };

describe('colorFor', () => {
  it('is green plain, red with Shift, blue with Alt and orange with Ctrl', () => {
    expect(colorFor(keys)).toBe('green');
    expect(colorFor({ ...keys, shiftKey: true })).toBe('red');
    expect(colorFor({ ...keys, altKey: true })).toBe('blue');
    expect(colorFor({ ...keys, ctrlKey: true })).toBe('orange');
  });
});

describe('drawingBetween', () => {
  it('draws an arrow between two squares and a circle on one', () => {
    expect(drawingBetween('e2', 'e4', 'green')).toEqual({ kind: 'arrow', from: 'e2', to: 'e4', color: 'green' });
    expect(drawingBetween('e4', 'e4', 'red')).toEqual({ kind: 'circle', square: 'e4', color: 'red' });
  });
});

describe('toggleDrawing', () => {
  const arrow = drawingBetween('e2', 'e4', 'green');
  const circle = drawingBetween('d5', 'd5', 'green');

  it('adds a new drawing', () => {
    expect(toggleDrawing([arrow], circle)).toEqual([arrow, circle]);
  });

  it('removes the same arrow or circle drawn again', () => {
    expect(toggleDrawing([arrow, circle], arrow)).toEqual([circle]);
    expect(toggleDrawing([arrow, circle], circle)).toEqual([arrow]);
  });

  it('recolours the same squares drawn in another colour', () => {
    const red: Drawing = drawingBetween('e2', 'e4', 'red');
    expect(toggleDrawing([arrow, circle], red)).toEqual([circle, red]);
  });

  it('keeps an arrow and the reverse arrow apart', () => {
    expect(toggleDrawing([arrow], drawingBetween('e4', 'e2', 'green'))).toHaveLength(2);
  });
});
