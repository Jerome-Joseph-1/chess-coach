import { describe, expect, it } from 'vitest';
import { beat, RAMP_MIN_MS, RAMP_START_MS } from './pacing';

describe('autoplay pace', () => {
  it('starts slow and speeds up through a long stretch', () => {
    const beats = Array.from({ length: 12 }, (_, i) => beat(i, 20 - i));
    expect(beats[0]).toBe(RAMP_START_MS);
    for (let i = 1; i < beats.length; i++) expect(beats[i]).toBeLessThanOrEqual(beats[i - 1]);
    expect(beats.at(-1)).toBe(RAMP_MIN_MS);
  });

  it('slows down over the last three moves before a stop', () => {
    expect([beat(10, 3), beat(11, 2), beat(12, 1)]).toEqual([350, 450, 600]);
  });

  it('never goes quicker than the slowest of the ramp and the approach', () => {
    expect(beat(0, 1)).toBe(600);
    expect(beat(1, 3)).toBe(375);
  });

  it('takes about five seconds for fifteen moves instead of nine', () => {
    const total = Array.from({ length: 15 }, (_, i) => beat(i, 15 - i)).reduce((a, b) => a + b, 0);
    expect(total).toBeLessThan(6000);
    expect(total).toBeGreaterThan(4000);
  });
});
