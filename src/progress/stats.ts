import type { Kind, Level, MomentResult, OpeningId } from '../content/types';
import { startOfDay } from './days';
import { isRight } from './moments';
import type { PlayedGame } from './model';

export interface RateCount {
  right: number;
  total: number;
}

export type StatKind = Kind | 'nothing';

export interface SetStats {
  games: number;
  /** Pauses and silent finds. */
  found: RateCount;
  byKind: Record<StatKind, RateCount>;
}

export const STAT_KINDS: StatKind[] = ['win', 'defend', 'trap', 'nothing'];

function emptyCount(): RateCount {
  return { right: 0, total: 0 };
}

function tally(count: RateCount, right: boolean): void {
  count.total += 1;
  if (right) count.right += 1;
}

export function percent(count: RateCount): number | null {
  return count.total === 0 ? null : Math.round((100 * count.right) / count.total);
}

/** First attempts only: replays of a moment would flatter the numbers. */
export function setStats(moments: MomentResult[], games: PlayedGame[], opening: OpeningId, level: Level): SetStats {
  const stats: SetStats = {
    games: games.filter((g) => g.opening === opening && g.level === level).length,
    found: emptyCount(),
    byKind: { win: emptyCount(), defend: emptyCount(), trap: emptyCount(), nothing: emptyCount() },
  };
  for (const m of moments) {
    if (m.opening !== opening || m.level !== level || m.review) continue;
    const right = isRight(m);
    if (m.type === 'nothing') {
      tally(stats.byKind.nothing, right);
      continue;
    }
    tally(stats.found, right);
    for (const kind of m.kinds) tally(stats.byKind[kind], right);
  }
  return stats;
}

export interface WeekStats {
  total: RateCount;
  /** Every counted moment sits in exactly one part, so the parts add up to the total. */
  parts: Record<StatKind, RateCount>;
}

const WEEK_DAYS = 7;

// A moment with several kinds belongs to its first one, so the weekly bar has no overlaps.
function partOf(m: MomentResult): StatKind | null {
  return m.type === 'nothing' ? 'nothing' : (m.kinds[0] ?? null);
}

/** The last 7 days, today included. Replays are left out like in setStats. */
export function weekStats(moments: MomentResult[], now: number): WeekStats {
  const since = startOfDay(now, WEEK_DAYS - 1);
  const stats: WeekStats = {
    total: emptyCount(),
    parts: { win: emptyCount(), defend: emptyCount(), trap: emptyCount(), nothing: emptyCount() },
  };
  for (const m of moments) {
    const part = partOf(m);
    if (m.review || m.at < since || !part) continue;
    tally(stats.total, isRight(m));
    tally(stats.parts[part], isRight(m));
  }
  return stats;
}
