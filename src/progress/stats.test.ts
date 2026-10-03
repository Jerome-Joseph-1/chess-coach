import { describe, expect, it } from 'vitest';
import { dayKey, daysBetween, lastWeeks } from './days';
import { percent, setStats } from './stats';
import { moment, noon, wrong } from './testkit';

describe('set stats', () => {
  const games = [
    { opening: 'italian' as const, level: 1400 as const, gameId: 'a', at: 1 },
    { opening: 'italian' as const, level: 1400 as const, gameId: 'b', at: 2 },
    { opening: 'caro-kann' as const, level: 1400 as const, gameId: 'c', at: 3 },
  ];

  it('counts first attempts by kind', () => {
    const moments = [
      moment({ kinds: ['win'] }),
      wrong({ kinds: ['win', 'trap'] }),
      moment({ type: 'silent', kinds: ['defend'] }),
      moment({ type: 'nothing', kinds: [] }),
      wrong({ type: 'nothing', kinds: [] }),
      moment({ kinds: ['win'], review: true }),
      moment({ opening: 'caro-kann' }),
    ];
    const stats = setStats(moments, games, 'italian', 1400);
    expect(stats.games).toBe(2);
    expect(stats.found).toEqual({ right: 2, total: 3 });
    expect(stats.byKind).toEqual({
      win: { right: 1, total: 2 },
      defend: { right: 1, total: 1 },
      trap: { right: 0, total: 1 },
      nothing: { right: 1, total: 2 },
    });
  });

  it('rounds a rate and reports no rate without data', () => {
    expect(percent({ right: 2, total: 3 })).toBe(67);
    expect(percent({ right: 0, total: 0 })).toBeNull();
  });
});

describe('days', () => {
  it('formats a local day and counts calendar days across a month end', () => {
    expect(dayKey(new Date(2026, 0, 5, 23, 59).getTime())).toBe('2026-01-05');
    expect(daysBetween('2026-01-31', '2026-02-02')).toBe(2);
    expect(daysBetween('2026-03-01', '2026-03-01')).toBe(0);
  });

  it('lays out weeks Monday first, ending with the current week', () => {
    const wednesday = new Date(2026, 5, 3, 10).getTime();
    const weeks = lastWeeks(wednesday, 8);
    expect(weeks).toHaveLength(8);
    expect(weeks.every((w) => w.length === 7)).toBe(true);
    expect(weeks[7][0]).toBe('2026-06-01');
    expect(weeks[7][2]).toBe(dayKey(noon(2)));
    expect(weeks[0][0]).toBe('2026-04-13');
  });
});
