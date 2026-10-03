import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DAY, FakeStorage, moment, noon, openStore, summary } from './testkit';

let storage: FakeStorage;

beforeEach(() => {
  storage = new FakeStorage();
  vi.stubGlobal('localStorage', storage);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('stored data that cannot be trusted', () => {
  it('starts fresh when progress is corrupt or has the wrong shape', async () => {
    storage.data.set('cc.progress.v1', '{oops');
    expect((await openStore()).getLastGame()).toBeNull();
    storage.data.set('cc.progress.v1', JSON.stringify([1, 2, 3]));
    expect((await openStore()).playedGameIds('italian', 1400)).toEqual([]);
    storage.data.set('cc.progress.v1', JSON.stringify({ v: 1, moments: 'many', games: {}, depth: [], days: null }));
    const store = await openStore();
    expect(store.getSetStats('italian', 1400).games).toBe(0);
    expect(store.getDepth('italian', 1400)).toBe(1);
  });

  it('does not read data written by a newer version of the format', async () => {
    storage.data.set('cc.progress.v1', JSON.stringify({ v: 2, games: [{ opening: 'italian', level: 1400, gameId: 'x', at: 1 }] }));
    expect((await openStore()).playedGameIds('italian', 1400)).toEqual([]);
  });

  it('reads data saved without a version as version 1', async () => {
    storage.data.set('cc.progress.v1', JSON.stringify({ games: [{ opening: 'italian', level: 1400, gameId: 'x', at: 1 }] }));
    expect((await openStore()).playedGameIds('italian', 1400)).toEqual(['x']);
  });

  it('keeps the newest 5000 moments', async () => {
    const old = Array.from({ length: 4999 }, (_, i) => moment({ ply: i }));
    storage.data.set('cc.progress.v1', JSON.stringify({ v: 1, moments: old }));
    const store = await openStore();
    for (const ply of [10_000, 10_001, 10_002]) store.recordMoment(moment({ ply, type: 'nothing' }));
    const saved = JSON.parse(storage.data.get('cc.progress.v1')!);
    expect(saved.moments).toHaveLength(5000);
    expect(saved.moments[0].ply).toBe(2);
    expect(saved.moments.at(-1).ply).toBe(10_002);
  });

  it('writes versioned keys', async () => {
    const store = await openStore();
    store.saveSettings(store.getSettings());
    store.recordMoment(moment());
    expect(JSON.parse(storage.data.get('cc.settings.v1')!).v).toBe(1);
    expect(JSON.parse(storage.data.get('cc.progress.v1')!).v).toBe(1);
  });
});

describe('settings and data tools', () => {
  it('keeps settings when progress is reset', async () => {
    const store = await openStore();
    store.saveSettings({ ...store.getSettings(), theme: 'dark', depthOverride: 2 });
    store.recordGame(summary(noon()));
    store.resetProgress();
    expect(store.getSettings()).toMatchObject({ theme: 'dark', depthOverride: 2 });
    expect(store.hasPlayed()).toBe(false);
  });

  it('shows the last game and its bonus after a reload', async () => {
    let store = await openStore();
    store.recordGame(summary(noon(0)));
    store.recordMoment(moment({ at: noon(5) }));
    store.recordGame(summary(noon(5), [moment({ at: noon(5) })], 'italian-1400-0002'));
    store = await openStore();
    expect(store.getLastGame()?.gameId).toBe('italian-1400-0002');
    expect(store.getLastGameBonus()).toBe(true);
  });

  it('lists active days once each, in order', async () => {
    const store = await openStore();
    store.recordMoment(moment({ at: noon(3) }));
    store.recordMoment(moment({ at: noon(3) + DAY / 4 }));
    store.recordMoment(moment({ at: noon(1) }));
    expect([...store.getActiveDays()]).toEqual(['2026-06-02', '2026-06-04']);
  });

  it('does not throw when persistent storage is refused or missing', async () => {
    vi.stubGlobal('navigator', {
      storage: {
        persist: () => {
          throw new Error('no');
        },
      },
    });
    let store = await openStore();
    expect(() => store.recordGame(summary(noon()))).not.toThrow();
    vi.stubGlobal('navigator', {});
    store = await openStore();
    expect(() => store.recordGame(summary(noon()))).not.toThrow();
  });

  it('imports into a store that already has data, replacing it', async () => {
    const source = await openStore();
    source.recordGame(summary(noon(), [], 'italian-1400-0007'));
    const text = source.exportProgress();
    const target = await openStore();
    target.recordGame(summary(noon(), [], 'italian-1400-0001'));
    expect(target.importProgress(text)).toEqual({ ok: true });
    expect(target.playedGameIds('italian', 1400)).toEqual(['italian-1400-0007']);
    expect(JSON.parse(storage.data.get('cc.progress.v1')!).games).toHaveLength(1);
  });

  it('survives an install-hint write failure', async () => {
    storage.failWrites = true;
    const store = await openStore();
    expect(() => store.dismissInstallHint()).not.toThrow();
  });
});
