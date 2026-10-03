import { describe, expect, it } from 'vitest';
import { burstSpecks, overshoot, resumeAt, ringDelays, squareDistance } from './effects';

describe('squareDistance', () => {
  it('counts king steps', () => {
    expect(squareDistance('e4', 'e4')).toBe(0);
    expect(squareDistance('e4', 'f6')).toBe(2);
    expect(squareDistance('a1', 'h8')).toBe(7);
  });
});

describe('ringDelays', () => {
  it('starts the nearest ring at once and each further ring one stagger step later', () => {
    const delays = ringDelays('g1', ['f3', 'h3', 'e2'], 50, 80);
    expect(delays.get('e2')).toBe(0);
    expect(delays.get('f3')).toBe(0);
    expect(delays.get('h3')).toBe(0);

    const pawn = ringDelays('e2', ['e3', 'e4'], 50, 80);
    expect(pawn.get('e3')).toBe(0);
    expect(pawn.get('e4')).toBe(50);
  });

  it('shortens the step for a long-range piece so the farthest ring starts in time', () => {
    const file = ['a2', 'a3', 'a4', 'a5', 'a6', 'a7', 'a8'];
    const delays = ringDelays('a1', file, 50, 80);
    expect(delays.get('a2')).toBe(0);
    expect(delays.get('a8')).toBe(80);
    const inOrder = file.map((square) => delays.get(square)!);
    expect(inOrder).toEqual([...inOrder].sort((a, b) => a - b));
    expect(new Set(inOrder).size).toBe(file.length);
  });

  it('fits the rings that are there into the time, however far the first one is', () => {
    const delays = ringDelays('d1', ['d5', 'd3', 'd4'], 50, 80);
    expect(Object.fromEntries(delays)).toEqual({ d3: 0, d4: 40, d5: 80 });
  });

  it('is empty when the piece has nowhere to go', () => {
    expect(ringDelays('e4', [], 50, 80).size).toBe(0);
  });
});

describe('burstSpecks', () => {
  const seeded = (seed: number) => () => {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647;
  };

  it('sends the asked number of specks 18 to 28 px out, a few px wide', () => {
    const specks = burstSpecks(10, seeded(7));
    expect(specks).toHaveLength(10);
    for (const { x, y, size } of specks) {
      expect(Math.hypot(x, y)).toBeGreaterThanOrEqual(18);
      expect(Math.hypot(x, y)).toBeLessThanOrEqual(28);
      expect(size).toBeGreaterThanOrEqual(4);
      expect(size).toBeLessThanOrEqual(6);
    }
  });

  it('spreads them round the circle, one to each slice, with random angles inside it', () => {
    const slices = burstSpecks(10, seeded(42)).map(({ x, y }) => {
      const angle = (Math.atan2(y, x) + 2 * Math.PI) % (2 * Math.PI);
      return Math.floor(angle / ((2 * Math.PI) / 10));
    });
    expect(slices).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
    expect(burstSpecks(10, seeded(1))).not.toEqual(burstSpecks(10, seeded(2)));
  });
});

describe('resumeAt', () => {
  it('moves the start back by the time already gone', () => {
    expect(resumeAt({ duration: 220 }, 100)).toEqual({ duration: 220, delay: -100 });
    expect(resumeAt({ duration: 120, delay: 50 }, 20)).toEqual({ duration: 120, delay: 30 });
  });

  it('counts every iteration, and gives nothing once the animation would be over', () => {
    expect(resumeAt({ duration: 700, iterations: 2 }, 1000)).toEqual({ duration: 700, iterations: 2, delay: -1000 });
    expect(resumeAt({ duration: 700, iterations: 2 }, 1400)).toBeNull();
    expect(resumeAt({ duration: 120, delay: 80 }, 250)).toBeNull();
  });
});

describe('overshoot', () => {
  it('pushes on along the way the piece came', () => {
    expect(overshoot({ column: 0, row: 5 }, { column: 0, row: 6 }, 4)).toEqual({ x: 0, y: 4 });
    const diagonal = overshoot({ column: 4, row: 4 }, { column: 2, row: 2 }, 4);
    expect(diagonal.x).toBeCloseTo(-2 * Math.SQRT2);
    expect(diagonal.y).toBeCloseTo(-2 * Math.SQRT2);
  });
});
