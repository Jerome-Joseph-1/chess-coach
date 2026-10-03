// Test data: the two real games shipped in public/content.
import type { Game, SetIndex } from '../content/types';
import set from '../../public/content/italian-1400/index.json';
import game1 from '../../public/content/italian-1400/games/italian-1400-0001.json';
import game2 from '../../public/content/italian-1400/games/italian-1400-0002.json';

export const fixtureSet = set as unknown as SetIndex;
export const fixtureGames = [game1, game2] as unknown as Game[];

export function fixtureGame(id: string): Game {
  const game = fixtureGames.find((g) => g.id === id);
  if (!game) throw new Error(`No fixture game ${id}`);
  return structuredClone(game);
}
