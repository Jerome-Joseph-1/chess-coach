import { describe, expect, it } from 'vitest';
import type { Turn } from '../content/types';
import { fixtureGames } from './fixtures';
import { gradeMove, holdShare, isHolding } from './grading';

function turnWith(grades: Record<string, number>, human: Turn['human'] = []): Turn {
  return { ...fixtureGames[0].turns[0], grades, human };
}

describe('gradeMove', () => {
  const turn = turnWith({ a: 0, b: 0.5, c: 0.6, d: 2.5, e: 2.6, f: 9.9, g: 10, h: 59.3 });

  it('uses the thresholds at their boundaries', () => {
    expect(gradeMove(turn, 'a')).toEqual({ verdict: 'best', loss: 0 });
    expect(gradeMove(turn, 'b').verdict).toBe('best');
    expect(gradeMove(turn, 'c').verdict).toBe('good');
    expect(gradeMove(turn, 'd').verdict).toBe('good');
    expect(gradeMove(turn, 'e').verdict).toBe('inaccuracy');
    expect(gradeMove(turn, 'f').verdict).toBe('inaccuracy');
    expect(gradeMove(turn, 'g').verdict).toBe('mistake');
    expect(gradeMove(turn, 'h')).toEqual({ verdict: 'mistake', loss: 59.3 });
  });

  it('is unknown for a move that was not analysed', () => {
    expect(gradeMove(turn, 'z')).toEqual({ verdict: 'unknown' });
  });
});

describe('isHolding', () => {
  const turn = turnWith({ best: 0, good: 2, slip: 5, bad: 20 });

  it('holds for best and good moves only', () => {
    expect(isHolding(turn, 'best')).toBe(true);
    expect(isHolding(turn, 'good')).toBe(true);
    expect(isHolding(turn, 'slip')).toBe(false);
    expect(isHolding(turn, 'bad')).toBe(false);
    expect(isHolding(turn, 'unknown')).toBe(false);
  });
});

describe('holdShare', () => {
  it('adds the shares of the human moves that hold', () => {
    const turn = turnWith(
      { best: 0, good: 2, slip: 5, bad: 20 },
      [
        { uci: 'best', share: 0.4 },
        { uci: 'good', share: 0.25 },
        { uci: 'slip', share: 0.2 },
        { uci: 'bad', share: 0.1 },
        { uci: 'unlisted', share: 0.05 },
      ],
    );
    expect(holdShare(turn)).toBeCloseTo(0.65);
  });

  it('is between 0 and 1 for the fixture turns', () => {
    for (const game of fixtureGames) {
      for (const turn of game.turns) {
        expect(holdShare(turn)).toBeGreaterThanOrEqual(0);
        expect(holdShare(turn)).toBeLessThanOrEqual(1.0001);
      }
    }
  });
});
