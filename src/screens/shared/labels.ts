import { openingById } from '../../content/catalog';
import type { Level, OpeningId } from '../../content/types';
import type { StatKind } from '../../progress/stats';

export const OPENING_TITLES: Record<OpeningId, string> = {
  italian: 'Italian Game',
  'caro-kann': 'Caro-Kann Defense',
};

/** What the weekly bar, legends and the Progress screen call each part. */
export const STAT_LABELS: Record<StatKind, string> = {
  win: 'Chances to win',
  defend: 'Threats',
  trap: 'Traps',
  nothing: 'Quiet',
};

export function sideLine(opening: OpeningId): string {
  return `You play ${openingById(opening).side === 'w' ? 'White' : 'Black'}`;
}

/** The side line, plus how many games you have played once you have played any. */
export function gamesLine(opening: OpeningId, games: number): string {
  if (games === 0) return sideLine(opening);
  return `${sideLine(opening)} · ${games} ${games === 1 ? 'game' : 'games'}`;
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
