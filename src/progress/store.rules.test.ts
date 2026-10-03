import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Depth, Level } from '../content/types';
import { FakeStorage, moment, noon, openStore, summary, wrong, type Store } from './testkit';

let storage: FakeStorage;

beforeEach(() => {
  storage = new FakeStorage();
  vi.stubGlobal('localStorage', storage);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

const mix = (held: number) => [...Array(held).fill(true), ...Array(20 - held).fill(false)];

function play(store: Store, results: boolean[], depth: Depth, level: Level = 1400, first = 0) {
  return results.map((held, i) => store.recordMoment((held ? moment : wrong)({ ply: (first + i) * 2 + 1, depth, level, gameId: `g${level}` })));
}

describe('depth through the store', () => {
  it('moves down below 10 of 20 and starts a new window', async () => {
    const store = await openStore();
    play(store, mix(15), 1);
    expect(store.getDepth('italian', 1400)).toBe(4);
    const results = play(store, mix(9), 4);
    expect(results.at(-1)).toEqual({ depthChanged: 1 });
    expect(results.slice(0, -1).every((r) => r.depthChanged === undefined)).toBe(true);
    expect(store.getDepth('italian', 1400)).toBe(1);
  });

  it('counts only moments recorded at the current depth', async () => {
    const store = await openStore();
    const stale = play(store, mix(20), 3);
    expect(stale.every((r) => r.depthChanged === undefined)).toBe(true);
    expect(store.getDepth('italian', 1400)).toBe(1);
  });

  it('keeps a depth per opening and level', async () => {
    const store = await openStore();
    play(store, mix(20), 1, 1700);
    expect(store.getDepth('italian', 1700)).toBe(4);
    expect(store.getDepth('italian', 1400)).toBe(1);
    expect(store.getDepth('caro-kann', 1700)).toBe(1);
  });

  it('keeps a half-filled window across a reload', async () => {
    let store = await openStore();
    play(store, Array(10).fill(true), 1);
    store = await openStore();
    const rest = play(store, [...Array(5).fill(true), ...Array(5).fill(false)], 1, 1400, 10);
    expect(rest.at(-1)).toEqual({ depthChanged: 4 });
  });

  it('keeps the manual override across a reload and goes back to automatic when it is cleared', async () => {
    let store = await openStore();
    play(store, mix(20), 1);
    store.saveSettings({ ...store.getSettings(), depthOverride: 5 });
    store = await openStore();
    expect(store.getDepth('italian', 1400)).toBe(5);
    expect(store.getDepth('caro-kann', 1100)).toBe(5);
    store.saveSettings({ ...store.getSettings(), depthOverride: undefined });
    expect(store.getDepth('italian', 1400)).toBe(4);
  });

  it('drops an out-of-range override', async () => {
    const store = await openStore();
    store.saveSettings({ ...store.getSettings(), depthOverride: 7 as never });
    expect(store.getDepth('italian', 1400)).toBe(1);
  });
});

describe('reviews through the store', () => {
  it('brings a missed moment back and retires it after the ladder', async () => {
    const store = await openStore();
    store.recordMoment(wrong({ at: noon(0) }));
    expect(store.dueReviews('italian', 1400, noon(1))).toHaveLength(1);
    store.recordMoment(moment({ at: noon(1), review: true }));
    expect(store.dueReviews('italian', 1400, noon(3))).toHaveLength(0);
    expect(store.dueReviews('italian', 1400, noon(4))).toHaveLength(1);
    store.recordMoment(moment({ at: noon(4), review: true }));
    store.recordMoment(moment({ at: noon(11), review: true }));
    store.recordMoment(moment({ at: noon(32), review: true }));
    expect(store.dueReviews('italian', 1400, noon(400))).toEqual([]);
  });

  it('keeps reviews after a reload and per set', async () => {
    let store = await openStore();
    store.recordMoment(wrong({ at: noon(0) }));
    store.recordMoment(wrong({ at: noon(0), level: 1700, gameId: 'italian-1700-0001' }));
    store = await openStore();
    expect(store.dueReviews('italian', 1400, noon(2)).map((r) => r.gameId)).toEqual(['italian-1400-0001']);
    expect(store.dueReviews('italian', 1700, noon(2)).map((r) => r.gameId)).toEqual(['italian-1700-0001']);
    expect(store.dueReviews('caro-kann', 1400, noon(2))).toEqual([]);
  });

  it('lists the oldest due item first', async () => {
    const store = await openStore();
    store.recordMoment(wrong({ ply: 1, at: noon(2) }));
    store.recordMoment(wrong({ ply: 3, at: noon(0) }));
    store.recordMoment(wrong({ ply: 5, at: noon(1) }));
    expect(store.dueReviews('italian', 1400, noon(10)).map((r) => r.ply)).toEqual([3, 5, 1]);
  });

  it('pulls a past quiet moment back in once pauses are due', async () => {
    const store = await openStore();
    const quiet = (at: number) => moment({ ply: 7, type: 'nothing', kinds: [], at, review: at > noon(0) });
    for (const day of [0, 8, 39]) store.recordMoment(quiet(noon(day)));
    expect(store.dueReviews('italian', 1400, noon(100))).toEqual([]);

    store.recordMoment(wrong({ ply: 1, at: noon(0) }));
    store.recordMoment(wrong({ ply: 3, at: noon(0) }));
    const due = store.dueReviews('italian', 1400, noon(100));
    expect(due.map((r) => r.ply)).toEqual([1, 3, 7]);
  });
});

describe('weekly stats through the store', () => {
  it('counts what was recorded in the last seven days and keeps it after a reload', async () => {
    const store = await openStore();
    store.recordMoment(moment({ ply: 1, kinds: ['win'], at: noon(9) }));
    store.recordMoment(wrong({ ply: 3, kinds: ['trap'], at: noon(10) }));
    store.recordMoment(moment({ ply: 5, kinds: ['win'], at: noon(0) }));
    expect(store.getWeekStats(noon(10)).total).toEqual({ right: 1, total: 2 });

    const reloaded = await openStore();
    expect(reloaded.getWeekStats(noon(10)).parts.trap).toEqual({ right: 0, total: 1 });
    expect(reloaded.getWeekStats(noon(30)).total).toEqual({ right: 0, total: 0 });
  });
});

describe('stage unlocked by a game', () => {
  it('goes to the recap of the game that reached it, until it is seen', async () => {
    let store = await openStore();
    play(store, mix(15), 1);
    store.recordGame(summary(noon()));
    expect(store.getLastGameUnlock()).toBe(4);

    store = await openStore();
    expect(store.getLastGameUnlock()).toBe(4);
    store.clearLastGameUnlock();
    expect(store.getLastGameUnlock()).toBeNull();
    store = await openStore();
    expect(store.getLastGameUnlock()).toBeNull();
  });

  it('is not set by a game that stayed at its stage or moved down', async () => {
    const store = await openStore();
    play(store, mix(15), 1);
    store.recordGame(summary(noon(0)));
    store.clearLastGameUnlock();

    play(store, mix(9), 4);
    store.recordGame(summary(noon(0), [], 'italian-1400-0002'));
    expect(store.getDepth('italian', 1400)).toBe(1);
    expect(store.getLastGameUnlock()).toBeNull();

    store.recordGame(summary(noon(0), [], 'italian-1400-0003'));
    expect(store.getLastGameUnlock()).toBeNull();
  });

  it('is spent by the game that follows', async () => {
    const store = await openStore();
    play(store, mix(15), 1);
    store.recordGame(summary(noon(0)));
    store.recordGame(summary(noon(0), [], 'italian-1400-0002'));
    expect(store.getLastGameUnlock()).toBeNull();
  });
});
