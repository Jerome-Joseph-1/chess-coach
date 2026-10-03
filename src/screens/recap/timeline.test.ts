import { describe, expect, it } from 'vitest';
import { countValue } from '../../ui/motion';
import { PIP_GAP_MS, dockDelay, pipDelay, rowDelay, scoreDuration } from './timeline';

describe('Game complete timeline', () => {
  it('fills the pips 80ms apart', () => {
    expect(pipDelay(1) - pipDelay(0)).toBe(PIP_GAP_MS);
    expect(pipDelay(4) - pipDelay(0)).toBe(4 * PIP_GAP_MS);
  });

  it('lands the score as the last pip fills', () => {
    const lastPip = pipDelay(4);
    const landed = pipDelay(0) + scoreDuration(5);
    expect(landed).toBeGreaterThanOrEqual(lastPip);
    expect(countValue(0, 4, 1)).toBe(4);
  });

  it('staggers the rows and stops growing for long games', () => {
    expect(rowDelay(1) - rowDelay(0)).toBe(50);
    expect(rowDelay(30)).toBe(rowDelay(20));
  });

  it('brings Next game in after every row and pip', () => {
    for (const n of [0, 1, 5, 12]) {
      expect(dockDelay(n, n)).toBeGreaterThan(rowDelay(n - 1));
      expect(dockDelay(n, n)).toBeGreaterThan(pipDelay(n - 1));
    }
  });
});
