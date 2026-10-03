import { openingById } from '../../content/catalog';
import type { Kind, Level, MomentResult, OpeningId } from '../../content/types';
import { isRight } from '../../progress/moments';
import type { StatKind } from '../../progress/stats';

export const OPENING_TITLES: Record<OpeningId, string> = {
  italian: 'Italian Game',
  'caro-kann': 'Caro-Kann Defense',
};

/** What the weekly bar, legends and the You screen call each part. */
export const STAT_LABELS: Record<StatKind, string> = {
  win: 'Chances to win',
  defend: 'Threats',
  trap: 'Traps',
  nothing: 'Quiet',
};

/** What one key position is called in the recap and the review lists. */
export const KIND_LABELS: Record<Kind, string> = {
  win: 'Chance to win',
  defend: 'Threat',
  trap: 'Trap',
};

export function sideLine(opening: OpeningId): string {
  return `You play ${openingById(opening).side === 'w' ? 'White' : 'Black'}`;
}

export function ratingLine(level: Level): string {
  return `Opponents rated ${level}`;
}

export function playPath(opening: OpeningId, level: Level): string {
  return `/play/${opening}/${level}`;
}

export function reviewPath(item: { opening: OpeningId; level: Level; gameId: string; ply: number }): string {
  return `${playPath(item.opening, item.level)}?review=${item.gameId}:${item.ply}`;
}

export function momentLabel(m: MomentResult): string {
  if (m.type === 'nothing') return 'Quiet position';
  return m.kinds.length > 0 ? m.kinds.map((k) => KIND_LABELS[k]).join(' · ') : 'Key position';
}

export function outcomeText(m: MomentResult): string {
  if (!isRight(m)) return 'Missed it';
  if (m.type === 'nothing') return 'Right, nothing special';
  return m.type === 'silent' ? 'Found it without a hint' : 'Spotted it';
}
