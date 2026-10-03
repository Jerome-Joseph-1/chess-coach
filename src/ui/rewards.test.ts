import { describe, expect, it } from 'vitest';
import { particleCount, toUnit } from './confetti';
import { patternFor } from './haptics';
import { formatSigned } from './RollingNumber';
import { VOICES } from './sound';

describe('confetti', () => {
  it('scales particles to the milestone', () => {
    expect(particleCount('silent')).toBe(120);
    expect(particleCount('levelup')).toBe(160);
    expect(particleCount('perfect')).toBe(200);
  });

  it('normalises viewport pixels', () => {
    expect(toUnit({ x: 195, y: 422 }, { width: 390, height: 844 })).toEqual({ x: 0.5, y: 0.5 });
  });
});

describe('sound voices', () => {
  const ascending = (notes: number[]) => notes.every((n, i) => i === 0 || n > notes[i - 1]);

  it('uses two rising notes for a step and three for a move', () => {
    expect(VOICES.step.notes).toHaveLength(2);
    expect(ascending(VOICES.step.notes)).toBe(true);
    expect(VOICES.move.notes).toHaveLength(3);
    expect(ascending(VOICES.move.notes)).toBe(true);
  });

  it('uses four rising notes for a silent find and a chord for a level up', () => {
    expect(VOICES.silent.notes).toHaveLength(4);
    expect(ascending(VOICES.silent.notes)).toBe(true);
    expect(VOICES.levelup.gap).toBe(0);
    expect(VOICES.levelup.notes.length).toBeGreaterThan(2);
  });

  it('makes the wrong sound a low slide down', () => {
    const { notes, slideTo } = VOICES.wrong;
    expect(notes[0]).toBeLessThan(200);
    expect(slideTo).toBeLessThan(notes[0]);
  });
});

describe('haptics', () => {
  it('gives every kind a short pattern', () => {
    for (const kind of ['step', 'move', 'silent', 'levelup', 'perfect', 'wrong'] as const) {
      expect(patternFor(kind).length).toBeGreaterThan(0);
    }
  });
});

describe('formatSigned', () => {
  it('signs gains and losses and leaves zero bare', () => {
    expect([2, 0, -3].map(formatSigned)).toEqual(['+2', '0', '−3']);
  });
});
