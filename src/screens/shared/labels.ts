import type { Kind, Level, MomentResult, OpeningId } from '../../content/types';
import { isRight } from '../../progress/moments';
import type { StatKind } from '../../progress/stats';

export const KIND_LABELS: Record<Kind, string> = {
  win: 'Winning chance',
  defend: 'Defend',
  trap: 'Trap',
};

export const STAT_LABELS: Record<StatKind, string> = {
  win: 'Winning chances',
  defend: 'Defending',
  trap: 'Traps',
  nothing: 'Quiet spots',
};

export function playPath(opening: OpeningId, level: Level): string {
  return `/play/${opening}/${level}`;
}

export function reviewPath(item: { opening: OpeningId; level: Level; gameId: string; ply: number }): string {
  return `${playPath(item.opening, item.level)}?review=${item.gameId}:${item.ply}`;
}

export function momentLabel(m: MomentResult): string {
  if (m.type === 'nothing') return 'Quiet position';
  return m.kinds.length > 0 ? m.kinds.map((k) => KIND_LABELS[k]).join(' · ') : 'Key moment';
}

export function outcomeText(m: MomentResult): string {
  const right = isRight(m);
  if (m.type === 'nothing') return right ? 'All quiet — right' : 'Nothing was there';
  if (m.type === 'silent') return right ? 'Spotted without a hint' : 'Missed';
  return right ? 'Found it' : 'Missed';
}
