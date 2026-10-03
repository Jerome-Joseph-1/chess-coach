import game0001 from '../../public/content/italian-1400/games/italian-1400-0001.json';
import game0002 from '../../public/content/italian-1400/games/italian-1400-0002.json';
import type { Game } from '../content/types';

/** Fixture games for tests. In game 0001 turn 1, 3, 7 and 9 are critical; game 0002 turn 1 is the trap and 17 a win. */
export const italian1 = game0001 as unknown as Game;
export const italian2 = game0002 as unknown as Game;
