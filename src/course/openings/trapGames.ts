// Build time only: the app must not import this file, as it pulls in traps.json. The app loads trap games from each set.
import type { Level, OpeningId } from '../../content/types';
import type { PositionRef, UnitEntry } from '../types';
import traps from './traps.json';
import { TRAP_TEXTS } from './traps';
import type { TrapGame } from './types';

/** The analysed trap positions, each with its own texts. */
export function readTraps(): TrapGame[] {
  return (traps as unknown as TrapGame[]).map((trap) => ({ ...trap, ...TRAP_TEXTS[trap.id] }));
}

function ownTraps(opening: OpeningId, traps: TrapGame[]): TrapGame[] {
  return traps.filter((trap) => trap.opening === opening);
}

/** The trap lesson's course entry for one set: the example first, then the practice positions. */
export function trapEntry(set: string, opening: OpeningId, traps: TrapGame[]): UnitEntry | null {
  const own = ownTraps(opening, traps);
  const example = own.find((trap) => trap.role === 'example');
  if (!example) return null;
  const ref = (trap: TrapGame): PositionRef => ({ set, gameId: trap.id, ply: 0, findShare: 0 });
  return { id: example.lesson, examples: [ref(example)], drills: own.filter((trap) => trap.role === 'drill').map(ref) };
}

/** The trap games to write into a set's games folder, as file name and game JSON. */
export function trapGameFiles(opening: OpeningId, level: Level, traps: TrapGame[]): { file: string; game: unknown }[] {
  return ownTraps(opening, traps).map((trap) => ({ file: `${trap.id}.json`, game: { ...trap, level } }));
}
