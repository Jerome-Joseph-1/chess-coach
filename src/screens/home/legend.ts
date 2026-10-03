import { STAT_KINDS, type StatKind, type WeekStats } from '../../progress/stats';
import { STAT_LABELS } from '../shared/labels';

export interface LegendItem {
  kind: StatKind;
  text: string;
  right: number;
  total: number;
}

/** One entry per kind of position that came up this week, e.g. "Chances to win 14/20". */
export function legendItems(stats: WeekStats): LegendItem[] {
  return STAT_KINDS.filter((kind) => stats.parts[kind].total > 0).map((kind) => {
    const { right, total } = stats.parts[kind];
    return { kind, text: `${STAT_LABELS[kind]} ${right}/${total}`, right, total };
  });
}
