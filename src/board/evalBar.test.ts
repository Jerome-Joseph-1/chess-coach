import { describe, expect, it } from 'vitest';
import { barLabel, whiteShare } from './evalBar';

describe('whiteShare', () => {
  it('is half for a level position and grows with White’s lead', () => {
    expect(whiteShare({ cp: 0 })).toBe(0.5);
    expect(whiteShare({ cp: 180 })).toBeGreaterThan(0.6);
    expect(whiteShare({ cp: 180 })).toBeLessThan(0.7);
    expect(whiteShare({ cp: -180 })).toBeCloseTo(1 - whiteShare({ cp: 180 }));
  });

  it('never fills completely on centipawns, and fills for a mate or a won game', () => {
    expect(whiteShare({ cp: 900 })).toBeLessThan(1);
    expect(whiteShare({ mate: 3 })).toBe(1);
    expect(whiteShare({ mate: -2 })).toBe(0);
    expect(whiteShare({ winner: 'b' })).toBe(0);
  });
});

describe('barLabel', () => {
  it('writes pawns, mates and results', () => {
    expect(barLabel({ cp: 183 })).toBe('+1.8');
    expect(barLabel({ cp: -40 })).toBe('−0.4');
    expect(barLabel({ mate: -3 })).toBe('M3');
    expect(barLabel({ winner: 'w' })).toBe('1-0');
  });
});
