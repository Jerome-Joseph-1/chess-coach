// Test data: real games and single turns copied from the generated content.
import type { Game, Side, Turn } from '../content/types';
import caroKann1 from './fixtures/caro-kann-1100-0001.json';
import caroKann25 from './fixtures/caro-kann-1100-0025.json';
import italian1 from './fixtures/italian-1400-0001.json';
import italian3 from './fixtures/italian-1400-0003.json';
import turns from './fixtures/turns.json';

export const learnGames = [caroKann1, caroKann25, italian1, italian3] as unknown as Game[];

export function learnGame(id: string): Game {
  const game = learnGames.find((g) => g.id === id);
  if (!game) throw new Error(`No fixture game ${id}`);
  return game;
}

type TurnKey = keyof typeof turns;

/** A one-turn game holding a real turn, keyed "game-id#turn-index". */
export function realTurn(key: TurnKey): Game {
  const { side, turn } = turns[key] as unknown as { side: Side; turn: Turn };
  return { id: key, opening: 'italian', level: 1400, side, start: [], moves: [], turns: [turn] };
}
