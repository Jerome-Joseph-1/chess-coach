import { describe, expect, it, vi } from 'vitest';
import { countUp, countValue, staggerDelay } from './motion';

describe('staggerDelay', () => {
  it('spaces items and stops growing after eight', () => {
    expect([0, 1, 2].map((i) => staggerDelay(i))).toEqual([0, 50, 100]);
    expect(staggerDelay(20)).toBe(400);
  });
});

describe('countValue', () => {
  it('starts and lands exactly, and eases out on the way', () => {
    expect(countValue(0, 4, 0)).toBe(0);
    expect(countValue(0, 4, 1)).toBe(4);
    expect(countValue(0, 100, 0.5)).toBe(88);
    expect(countValue(0, 4, 2)).toBe(4);
  });
});

describe('countUp', () => {
  it('jumps straight to the end when there is nothing to animate', () => {
    const show = vi.fn();
    countUp(3, 3, 400, show);
    countUp(0, 5, 0, show);
    expect(show.mock.calls).toEqual([[3], [5]]);
  });
});
