import type { Game, Level, OpeningId, SetIndex } from './types';

export const CONTENT_URL = `${import.meta.env.BASE_URL}content/`;

export function setKey(opening: OpeningId, level: Level): string {
  return `${opening}-${level}`;
}

export function gameUrl(opening: OpeningId, level: Level, id: string): string {
  return `${CONTENT_URL}${setKey(opening, level)}/games/${id}.json`;
}

export async function loadSet(opening: OpeningId, level: Level): Promise<SetIndex | null> {
  const res = await fetch(`${CONTENT_URL}${setKey(opening, level)}/index.json`);
  return res.ok ? res.json() : null;
}

export async function loadGame(opening: OpeningId, level: Level, id: string): Promise<Game> {
  const res = await fetch(gameUrl(opening, level, id));
  if (!res.ok) throw new Error(`Game ${id} not found`);
  return res.json();
}
