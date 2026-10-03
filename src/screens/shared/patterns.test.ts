import { describe, expect, it } from 'vitest';
import { themeFor, type Theme } from '../../learn';
import { learnGame } from '../../learn/fixtures';
import { fillDelay } from './PatternParts';
import { PATTERNS, patternOfTheme } from './patterns';

const theme = (overrides: Partial<Theme>): Theme => ({ id: 'quiet', tactic: null, pieces: [], moves: [], ...overrides });

describe('patterns', () => {
  it('groups themes into the patterns Today and Progress count', () => {
    expect(patternOfTheme(theme({ id: 'fork' }))).toBe('fork');
    expect(patternOfTheme(theme({ id: 'free-piece' }))).toBe('loose');
    expect(patternOfTheme(theme({ id: 'trapped-piece' }))).toBe('trapped');
    expect(patternOfTheme(theme({ id: 'hanging-own' }))).toBe('threat');
    expect(patternOfTheme(theme({ id: 'threat-other', pattern: 'fork' }))).toBe('threat');
    expect(patternOfTheme(theme({ id: 'bait' }))).toBe('trap');
    expect(patternOfTheme(theme({ id: 'quiet' }))).toBe('quiet');
  });

  it('names a back-rank mate apart from other mates', () => {
    const mate = { id: 'checkmate', backRank: true } as unknown as Theme['tactic'];
    expect(patternOfTheme(theme({ id: 'checkmate', tactic: mate }))).toBe('back-rank');
    expect(patternOfTheme(theme({ id: 'checkmate' }))).toBe('mate');
  });

  it('names every key position of a real game', () => {
    const game = learnGame('italian-1400-0001');
    const names = game.turns.map((_, i) => PATTERNS[patternOfTheme(themeFor(game, i))].name);
    expect(new Set(names)).toEqual(new Set(['Nothing here', 'Checkmate', 'Traps']));
  });
});

describe('pattern meters', () => {
  it('start filling 60ms apart', () => {
    expect([0, 1, 2].map(fillDelay).map((ms) => ms - fillDelay(0))).toEqual([0, 60, 120]);
  });
});
