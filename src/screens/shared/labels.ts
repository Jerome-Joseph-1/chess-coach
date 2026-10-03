import { openingById } from '../../content/catalog';
import type { Level, OpeningId } from '../../content/types';
import type { UnitId } from '../../course/types';
import type { StatKind } from '../../progress/stats';

export const OPENING_TITLES: Record<OpeningId, string> = {
  italian: 'Italian Game',
  'caro-kann': 'Caro-Kann Defense',
};

/** What the Review and Progress screens call each kind of position. */
export const STAT_LABELS: Record<StatKind, string> = {
  win: 'Chances to win',
  defend: 'Threats',
  trap: 'Traps',
  nothing: 'Quiet',
};

export function sideLine(opening: OpeningId): string {
  return `You play ${sideName(opening)}`;
}

export function ratingLine(level: Level): string {
  return `Opponents rated ${level}`;
}

export function playPath(opening: OpeningId, level: Level): string {
  return `/play/${opening}/${level}`;
}

export function lessonPath(opening: OpeningId, unit: UnitId): string {
  return `/lesson/${opening}/${unit}`;
}

export function reviewPath(item: { opening: OpeningId; level: Level; gameId: string; ply: number }): string {
  return `${playPath(item.opening, item.level)}?review=${item.gameId}:${item.ply}`;
}

/** The short names the opening switch uses. */
export const OPENING_SHORT: Record<OpeningId, string> = {
  italian: 'Italian Game',
  'caro-kann': 'Caro-Kann',
};

export function sideName(opening: OpeningId): string {
  return openingById(opening).side === 'w' ? 'White' : 'Black';
}

export function plural(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`;
}
