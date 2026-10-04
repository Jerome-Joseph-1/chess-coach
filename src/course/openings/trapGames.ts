import type { Level, OpeningId } from '../../content/types';
import type { UnitEntry } from '../types';
import type { TrapGame } from './types';

/** The analysed trap positions (build time only: the app loads them from each set's games). */
export function readTraps(): TrapGame[] {
  return [];
}

/** The trap lesson's course entry for one set: the example first, then the practice positions. */
export function trapEntry(_set: string, _opening: OpeningId, _traps: TrapGame[]): UnitEntry | null {
  return null;
}

/** The trap games to write into a set's games folder, as file name and game JSON. */
export function trapGameFiles(_opening: OpeningId, _level: Level, _traps: TrapGame[]): { file: string; game: unknown }[] {
  return [];
}
