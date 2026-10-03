import type { Depth, Game, SetIndex } from '../../content/types';

export interface NextGame {
  id: string;
  /** Place in the set, counting from 1. */
  number: number;
}

/** The first game of the set not played yet; once all are played the set starts over. */
export function pickNextGame(set: SetIndex, played: string[]): NextGame | null {
  if (set.games.length === 0) return null;
  const seen = new Set(played);
  const index = Math.max(0, set.games.findIndex((g) => !seen.has(g.id)));
  return { id: set.games[index].id, number: index + 1 };
}

/** The positions the game is built around: the ones that call for a real answer. */
export function keyPositions(game: Game): number {
  return game.turns.filter((t) => t.label === 'critical').length;
}

// Later stages ask more of each position; quick mode trims the talking.
const QUICK_FACTOR = 0.6;

export function estimateMinutes(positions: number, stage: Depth, quick: boolean): number {
  const minutes = positions * (0.5 + 0.1 * stage) * (quick ? QUICK_FACTOR : 1);
  return Math.max(1, Math.round(minutes));
}

export interface NextGameParts {
  /** What the game is made of, e.g. "5 key positions". */
  what: string;
  time: string | null;
}

export function nextGameParts(next: NextGame, positions: number | null, stage: Depth, quick: boolean): NextGameParts {
  if (positions === null) return { what: `Game ${next.number}`, time: null };
  const time = `about ${estimateMinutes(positions, stage, quick)} min`;
  if (positions === 0) return { what: 'No key positions', time };
  return { what: `${positions} key ${positions === 1 ? 'position' : 'positions'}`, time };
}
