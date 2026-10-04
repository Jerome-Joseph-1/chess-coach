import { describe, expect, it } from 'vitest';
import type { Depth, Label, MomentType, Turn } from '../content/types';
import { fixtureGames } from './fixtures';
import { chooseMoments, hashSeed, isCalm } from './pauses';

const DEPTHS: Depth[] = [1, 2, 3, 4, 5];
const SPAN: Record<Depth, number> = { 1: 1, 2: 1, 3: 1, 4: 2, 5: 6 };

// A calm position, so a 'nothing' turn made from it can be picked.
const CALM_TURN = fixtureGames[1].turns[0];

function turnAt(index: number, label: Label, extra: Partial<Turn> = {}): Turn {
  return { ...CALM_TURN, ply: 1 + 2 * index, label, trigger: false, inCheck: false, ...extra };
}

function countOf(moments: Map<number, MomentType>, type: MomentType): number {
  return [...moments.values()].filter((m) => m === type).length;
}

describe.each(fixtureGames)('chooseMoments on $id', (game) => {
  const cases = DEPTHS.flatMap((depth) => [false, true].map((quick) => ({ depth, quick })));

  it.each(cases)('keeps its invariants at depth $depth, quick $quick', ({ depth, quick }) => {
    const turns = game.turns;
    const moments = chooseMoments(turns, depth, { quick, seed: hashSeed(game.id) });

    for (const [i, type] of moments) {
      expect(i).toBeGreaterThanOrEqual(0);
      expect(i).toBeLessThan(turns.length);
      if (type === 'pause' || type === 'silent') expect(turns[i].label).toBe('critical');
      if (type === 'nothing') {
        expect(turns[i].label).toBe('nothing');
        expect(turns[i].inCheck).toBe(false);
        expect(moments.has(i - 1) || moments.has(i + 1)).toBe(false);
      }
    }

    for (const [i, type] of moments) {
      if (type !== 'playout') continue;
      let start = i - 1;
      while (moments.get(start) === 'playout') start--;
      expect(moments.get(start)).toBe('pause');
      expect(i - start).toBeLessThan(SPAN[depth]);
    }

    const prompted = countOf(moments, 'pause') + countOf(moments, 'nothing');
    if (quick) {
      expect(countOf(moments, 'silent')).toBe(0);
      expect(prompted).toBeLessThanOrEqual(3);
    }
    if (depth <= 3) expect(countOf(moments, 'playout')).toBe(0);
  });

  it('is repeatable for the same seed', () => {
    const a = chooseMoments(game.turns, 3, { seed: 7 });
    const b = chooseMoments(game.turns, 3, { seed: 7 });
    expect([...a]).toEqual([...b]);
  });

  it('turns every run of critical turns into one pause or silent check at depth 1', () => {
    const critical = game.turns.filter((t, i) => t.label === 'critical' && game.turns[i - 1]?.label !== 'critical').length;
    const moments = chooseMoments(game.turns, 1, { seed: hashSeed(game.id) });
    expect(countOf(moments, 'silent') + countOf(moments, 'pause')).toBe(critical);
  });
});

describe('chooseMoments rules', () => {
  const labels: Label[] = ['gray', 'critical', 'gray', 'nothing', 'gray', 'nothing', 'gray', 'critical', 'gray', 'nothing'];

  it('turns about a quarter of the critical turns into silent checks', () => {
    // Python-style rounding: halves go to the even neighbour.
    const expected: [number, number][] = [[1, 0], [2, 0], [3, 1], [4, 1], [6, 2], [10, 2], [14, 4]];
    for (const [critical, silent] of expected) {
      const turns = Array.from({ length: critical * 2 }, (_, i) => turnAt(i, i % 2 === 0 ? 'critical' : 'gray'));
      const moments = chooseMoments(turns, 1, { seed: 5 });
      expect(countOf(moments, 'silent')).toBe(silent);
      expect(countOf(moments, 'pause')).toBe(critical - silent);
    }
  });

  it('makes every critical turn a pause when silent checks are off', () => {
    const turns = Array.from({ length: 8 }, (_, i) => turnAt(i, i % 2 === 0 ? 'critical' : 'gray'));
    expect(countOf(chooseMoments(turns, 1, { seed: 5 }), 'silent')).toBe(1);

    const moments = chooseMoments(turns, 1, { seed: 5, silent: false });
    expect(countOf(moments, 'silent')).toBe(0);
    expect(countOf(moments, 'pause')).toBe(4);
  });

  it('never picks a silent check on the fixture games when they are off', () => {
    for (const game of fixtureGames) {
      for (const depth of DEPTHS) {
        const moments = chooseMoments(game.turns, depth, { seed: hashSeed(game.id), silent: false });
        expect(countOf(moments, 'silent')).toBe(0);
      }
    }
  });

  it('plays out the next five user turns after a pause at depth 5', () => {
    const turns = ['critical', 'gray', 'gray', 'gray', 'gray', 'gray', 'gray', 'gray', 'critical'].map((label, i) =>
      turnAt(i, label as Label),
    );
    const moments = chooseMoments(turns, 5, { seed: 1 });
    expect([...moments.entries()]).toEqual([
      [0, 'pause'],
      [1, 'playout'],
      [2, 'playout'],
      [3, 'playout'],
      [4, 'playout'],
      [5, 'playout'],
      [8, 'pause'],
    ]);
  });

  it('asks only about the first of back-to-back critical turns', () => {
    const turns = ['gray', 'critical', 'critical', 'critical', 'gray', 'critical'].map((label, i) => turnAt(i, label as Label));
    const moments = chooseMoments(turns, 1, { seed: 1 });
    expect(moments.get(1)).toBe('pause');
    expect(moments.has(2)).toBe(false);
    expect(moments.has(3)).toBe(false);
    expect(moments.get(5)).toBe('pause');
  });

  it('swallows a critical turn inside a play-out', () => {
    const turns = ['critical', 'gray', 'critical', 'gray', 'gray', 'gray', 'critical'].map((label, i) =>
      turnAt(i, label as Label),
    );
    const moments = chooseMoments(turns, 5, { seed: 1, quick: true });
    expect(moments.get(0)).toBe('pause');
    expect(moments.get(2)).toBe('playout');
  });

  it('covers two user moves at depth 4', () => {
    const turns = ['critical', 'gray', 'gray', 'critical'].map((label, i) => turnAt(i, label as Label));
    const moments = chooseMoments(turns, 4, { seed: 1 });
    expect([...moments.entries()]).toEqual([
      [0, 'pause'],
      [1, 'playout'],
      [3, 'pause'],
    ]);
  });

  it('asks at least two nothing pauses when enough candidates exist', () => {
    const turns = labels.map((label, i) => turnAt(i, label));
    const moments = chooseMoments(turns, 1, { seed: 3 });
    expect(countOf(moments, 'nothing')).toBeGreaterThanOrEqual(2);
  });

  it('adds nothing pauses until they are 40% of the pauses', () => {
    const turns = Array.from({ length: 20 }, (_, i) => turnAt(i, i % 4 === 0 ? 'critical' : i % 4 === 2 ? 'nothing' : 'gray'));
    const moments = chooseMoments(turns, 1, { seed: 2 });
    const pauses = countOf(moments, 'pause');
    const nothings = countOf(moments, 'nothing');
    expect(pauses).toBe(4);
    expect(nothings).toBe(3);
    expect(nothings / (pauses + nothings)).toBeGreaterThanOrEqual(0.4);
    expect((nothings - 1) / (pauses + nothings - 1)).toBeLessThan(0.4);
  });

  it('prefers nothing turns that follow a trigger', () => {
    const turns = ['gray', 'nothing', 'gray', 'nothing', 'gray', 'nothing', 'gray'].map((label, i) =>
      turnAt(i, label as Label, { trigger: i === 3 }),
    );
    for (const seed of [1, 2, 3, 4, 5, 6, 7, 8]) {
      const moments = chooseMoments(turns, 1, { seed });
      expect(moments.get(3)).toBe('nothing');
      expect(countOf(moments, 'nothing')).toBe(2);
    }
  });

  it('never picks two adjacent nothing turns or one in check', () => {
    const turns = ['nothing', 'nothing', 'nothing', 'nothing', 'nothing'].map((label, i) =>
      turnAt(i, label as Label, { inCheck: i === 4 }),
    );
    for (let seed = 1; seed <= 20; seed++) {
      const moments = chooseMoments(turns, 1, { seed });
      expect(moments.has(4)).toBe(false);
      for (const i of moments.keys()) expect(moments.has(i + 1)).toBe(false);
    }
  });

  it('keeps nothing turns away from marked turns', () => {
    const turns = ['critical', 'nothing', 'gray', 'nothing'].map((label, i) => turnAt(i, label as Label));
    for (let seed = 1; seed <= 10; seed++) {
      const moments = chooseMoments(turns, 1, { seed, quick: true });
      expect(moments.get(0)).toBe('pause');
      expect(moments.has(1)).toBe(false);
    }
  });

  it('limits quick mode to three pauses, critical ones first', () => {
    const turns = ['critical', 'gray', 'critical', 'gray', 'critical', 'gray', 'critical', 'nothing', 'gray'].map((label, i) =>
      turnAt(i, label as Label),
    );
    const moments = chooseMoments(turns, 1, { seed: 1, quick: true });
    expect([...moments.entries()]).toEqual([
      [0, 'pause'],
      [2, 'pause'],
      [4, 'pause'],
    ]);
  });

  it('adds one nothing pause in quick mode when there is room', () => {
    const turns = ['critical', 'gray', 'nothing', 'gray', 'nothing', 'gray'].map((label, i) => turnAt(i, label as Label));
    const moments = chooseMoments(turns, 1, { seed: 1, quick: true });
    expect(countOf(moments, 'pause')).toBe(1);
    expect(countOf(moments, 'nothing')).toBe(1);
  });

  it('returns nothing for a game with no turns', () => {
    expect(chooseMoments([], 3).size).toBe(0);
  });
});

describe('isCalm', () => {
  // italian-1400-0001 at ply 43: Qg7# and Qh7# are on, but every move grades 0 at 100% win.
  const MATE_IN_ONE = 'r1bq1rk1/bpp2p2/p1np3Q/4P2N/3P4/3B4/PP3PPP/R3R1K1 w - - 1 25';
  // Ra8# and nothing else going on.
  const BACK_RANK_MATE = '6k1/5ppp/8/8/8/8/5PPP/R5K1 w - - 0 1';
  // Bxg2 wins a pawn.
  const FREE_PAWN = 'r3kb1r/p4p1p/2b2p2/4p3/1p6/1P6/1PPPNPPP/R1B1K2R b KQkq - 1 15';
  // The e4 pawn is hit twice and held by nothing.
  const PAWN_ATTACKED = 'rnbqkbnr/pp2pppp/2p5/6N1/4p3/3P4/PPP2PPP/RNBQKB1R b KQkq - 1 4';
  const quietAt = (fen: string, bestWin: number) => turnAt(0, 'nothing', { fen, bestWin });

  it('accepts an open position with nothing to win or answer', () => {
    expect(isCalm(CALM_TURN)).toBe(true);
  });

  it('turns down a decided game whichever side it favours', () => {
    expect(isCalm({ ...CALM_TURN, bestWin: 95 })).toBe(false);
    expect(isCalm({ ...CALM_TURN, bestWin: 5 })).toBe(false);
  });

  it('turns down a mate in one, even when the win% looks open', () => {
    expect(isCalm(quietAt(MATE_IN_ONE, 100))).toBe(false);
    expect(isCalm(quietAt(MATE_IN_ONE, 60))).toBe(false);
    expect(isCalm(quietAt(BACK_RANK_MATE, 60))).toBe(false);
    expect(isCalm(quietAt(BACK_RANK_MATE.replace('R5K1', '6K1'), 60))).toBe(true);
  });

  it('turns down a capture that wins material', () => {
    expect(isCalm(quietAt(FREE_PAWN, 50))).toBe(false);
  });

  it('turns down a position where the opponent threatens to win material', () => {
    expect(isCalm(quietAt(PAWN_ATTACKED, 52))).toBe(false);
  });

  it('never makes the mate in one a nothing pause', () => {
    const turns = ['nothing', 'gray', 'nothing', 'gray', 'nothing'].map((label, i) =>
      turnAt(i, label as Label, i === 2 ? { fen: MATE_IN_ONE, bestWin: 100, trigger: true } : {}),
    );
    for (let seed = 1; seed <= 20; seed++) {
      const moments = chooseMoments(turns, 1, { seed });
      expect(moments.has(2)).toBe(false);
      expect(countOf(moments, 'nothing')).toBe(2);
    }
  });
});

describe('hashSeed', () => {
  it('is stable and tells ids apart', () => {
    expect(hashSeed('italian-1400-0001')).toBe(hashSeed('italian-1400-0001'));
    expect(hashSeed('italian-1400-0001')).not.toBe(hashSeed('italian-1400-0002'));
  });
});
