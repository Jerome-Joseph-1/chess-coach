import { describe, expect, it } from 'vitest';
import type { Kind, MomentResult } from '../../content/types';
import { weekStats } from '../../progress/stats';
import { moment, noon, wrong } from '../../progress/testkit';
import { legendItems } from './legend';

function many(kinds: Kind[], type: MomentResult['type'], right: number, total: number): MomentResult[] {
  return Array.from({ length: total }, (_, i) => (i < right ? moment : wrong)({ kinds, type, ply: i * 2 + 1 }));
}

describe('week legend', () => {
  const week = [
    ...many(['win'], 'pause', 14, 20),
    ...many(['defend'], 'pause', 9, 12),
    ...many(['trap'], 'pause', 5, 8),
    ...many([], 'nothing', 3, 6),
  ];

  it('turns the week into the numbers under the bar', () => {
    const stats = weekStats(week, noon());
    expect(stats.total).toEqual({ right: 31, total: 46 });
    expect(legendItems(stats).map((item) => item.text)).toEqual(['Chances to win 14/20', 'Threats 9/12', 'Traps 5/8', 'Quiet 3/6']);
  });

  it('leaves out kinds that did not come up', () => {
    const stats = weekStats(many(['trap'], 'pause', 1, 2), noon());
    expect(legendItems(stats).map((item) => item.text)).toEqual(['Traps 1/2']);
  });

  it('is empty before any game', () => {
    expect(legendItems(weekStats([], noon()))).toEqual([]);
  });

  it('counts a position with several kinds once, under its first kind', () => {
    const stats = weekStats([moment({ kinds: ['win', 'defend'] })], noon());
    expect(legendItems(stats).map((item) => item.text)).toEqual(['Chances to win 1/1']);
  });
});
