import { Chess } from 'chess.js';
import { describe, expect, it } from 'vitest';
import type { Game } from '../../content/types';
import { readTraps, trapEntry, trapGameFiles } from './trapGames';

const traps = readTraps();

describe('trapGameFiles', () => {
  it("writes one file per trap of the opening, named by its id, with the set's level", () => {
    const files = trapGameFiles('italian', 1700, traps);
    const italian = traps.filter((trap) => trap.opening === 'italian');
    expect(files.map((f) => f.file)).toEqual(italian.map((trap) => `${trap.id}.json`));
    expect(files.every((f) => f.file.startsWith('trap-italian-'))).toBe(true);
    for (const [i, { game }] of files.entries()) expect(game).toEqual({ ...italian[i], level: 1700 });
  });

  it("writes nothing of the other opening's traps", () => {
    const ids = trapGameFiles('caro-kann', 1100, traps).map((f) => (f.game as Game).id);
    expect(ids.length).toBeGreaterThan(0);
    expect(ids.every((id) => id.startsWith('trap-caro-kann-'))).toBe(true);
  });

  it('writes games that replay legally to the user’s move', () => {
    for (const opening of ['italian', 'caro-kann'] as const) {
      for (const { game } of trapGameFiles(opening, 1400, traps)) {
        const { id, side, start, moves, turns } = game as Game;
        const chess = new Chess();
        for (const san of start) chess.move(san);
        expect(chess.turn(), id).toBe(side);
        expect(chess.fen(), id).toBe(turns[0].fen);
        expect(() => chess.move(moves[turns[0].ply]), id).not.toThrow();
      }
    }
  });
});

describe('trapEntry', () => {
  it('gives the example first, then the practice in curated order, all at ply 0 of the set', () => {
    const entry = trapEntry('caro-kann-1400', 'caro-kann', traps)!;
    const own = traps.filter((trap) => trap.opening === 'caro-kann');
    expect(entry.id).toBe('caro-kann-traps');
    expect(entry.examples).toEqual([{ set: 'caro-kann-1400', gameId: 'trap-caro-kann-qe2', ply: 0, findShare: 0 }]);
    expect(entry.drills.map((d) => d.gameId)).toEqual(own.filter((trap) => trap.role === 'drill').map((trap) => trap.id));
    expect(entry.drills.every((d) => d.set === 'caro-kann-1400' && d.ply === 0 && d.findShare === 0)).toBe(true);
  });

  it('has no entry without an example', () => {
    expect(trapEntry('italian-1400', 'italian', traps.filter((trap) => trap.role === 'drill'))).toBeNull();
  });
});
