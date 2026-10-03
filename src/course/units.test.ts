import { describe, expect, it } from 'vitest';
import { realTurn } from '../learn/fixtures';
import { themeFor } from '../learn';
import { UNIT_IDS } from './types';
import { UNITS, isUnitId, unitOfTheme } from './units';

const unitOf = (key: Parameters<typeof realTurn>[0]) => unitOfTheme(themeFor(realTurn(key), 0));

describe('unitOfTheme', () => {
  it('teaches each named win in its own unit', () => {
    expect(unitOf('caro-kann-1100-0026#26')).toBe('free-piece');
    expect(unitOf('italian-1400-0006#3')).toBe('fork');
    expect(unitOf('italian-1100-0013#6')).toBe('pin');
    expect(unitOf('caro-kann-1400-0015#8')).toBe('remove-defender');
    expect(unitOf('caro-kann-1400-0028#5')).toBe('discovered');
    expect(unitOf('italian-2000-0029#15')).toBe('skewer');
    expect(unitOf('italian-1400-0015#25')).toBe('trapped');
  });

  it('puts mates, back-rank mates and mate threats under checkmate', () => {
    expect(unitOf('italian-1100-0027#16')).toBe('checkmate');
    expect(unitOf('caro-kann-1400-0013#18')).toBe('checkmate');
    expect(unitOf('italian-2000-0009#18')).toBe('checkmate');
  });

  it('sends a piece of yours that can be taken to pieces in danger, other threats to threats, baits to traps', () => {
    expect(unitOf('caro-kann-1100-0014#5')).toBe('piece-in-danger');
    expect(unitOf('caro-kann-1400-0028#11')).toBe('threats');
    expect(unitOf('caro-kann-1100-0013#7')).toBe('traps');
    expect(unitOf('caro-kann-2000-0001#3')).toBe('traps');
  });

  it('teaches no plain material win and no quiet position', () => {
    expect(unitOf('caro-kann-1100-0002#14')).toBeNull();
    expect(unitOf('caro-kann-1100-0011#19')).toBeNull();
  });
});

describe('UNITS', () => {
  it('names every unit with a title and one plain sentence', () => {
    for (const id of UNIT_IDS) {
      expect(UNITS[id].title).toMatch(/^[A-Z][a-z ]+$/);
      expect(UNITS[id].line).toMatch(/^[A-Z][^.]*\.$/);
    }
  });
});

it('isUnitId accepts the course units only', () => {
  expect(isUnitId('fork')).toBe(true);
  expect(isUnitId('forks')).toBe(false);
  expect(isUnitId('')).toBe(false);
});
