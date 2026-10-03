import { describe, expect, it } from 'vitest';
import { dayKey, daysBetween, lastWeeks, startOfDay } from './days';
import { percent, setStats, weekStats } from './stats';
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

describe('week stats', () => {
  const now = noon(10);
  const daysAgo = (n: number) => noon(10 - n);

  it('counts the last seven days, today included, in one part per moment', () => {
    const stats = weekStats(
      [
        moment({ ply: 1, kinds: ['win'], at: now }),
        wrong({ ply: 3, kinds: ['win', 'trap'], at: daysAgo(6) }),
        moment({ ply: 5, kinds: ['defend'], at: daysAgo(2) }),
        moment({ ply: 7, kinds: ['trap'], at: daysAgo(1) }),
        moment({ ply: 9, type: 'nothing', kinds: [], at: now }),
        wrong({ ply: 11, type: 'nothing', kinds: [], at: now }),
      ],
      now,
    );
    expect(stats.total).toEqual({ right: 4, total: 6 });
    expect(stats.parts.win).toEqual({ right: 1, total: 2 });
    expect(stats.parts.defend).toEqual({ right: 1, total: 1 });
    expect(stats.parts.trap).toEqual({ right: 1, total: 1 });
    expect(stats.parts.nothing).toEqual({ right: 1, total: 2 });
  });

  it('leaves out older moments, replays and moments without a part', () => {
    const stats = weekStats(
      [
        moment({ ply: 1, at: daysAgo(7) }),
        moment({ ply: 3, at: now, review: true }),
        moment({ ply: 5, kinds: [], at: now }),
        moment({ ply: 7, at: startOfDay(now, 6) }),
      ],
      now,
    );
    expect(stats.total).toEqual({ right: 1, total: 1 });
  });

  it('is empty before anything is played', () => {
    expect(weekStats([], now).total).toEqual({ right: 0, total: 0 });
  });
});
