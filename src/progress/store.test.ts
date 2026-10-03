import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { migrate } from './storage';
import { DAY, FakeStorage, moment, noon, openStore, summary, wrong, type Store } from './testkit';

let storage: FakeStorage;

beforeEach(() => {
  storage = new FakeStorage();
  vi.stubGlobal('localStorage', storage);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('settings', () => {
  it('starts with defaults', async () => {
    const store = await openStore();
    expect(store.getSettings()).toEqual({
      theme: 'system', board: 'green', sound: true, haptics: true, quick: false, levels: { italian: 1400, 'caro-kann': 1400 },
    });
  });

  it('survives a reload', async () => {
    let store = await openStore();
    store.saveSettings({ ...store.getSettings(), theme: 'dark', sound: false, levels: { italian: 1700, 'caro-kann': 1100 } });
    store = await openStore();
    expect(store.getSettings()).toMatchObject({ theme: 'dark', sound: false, levels: { italian: 1700, 'caro-kann': 1100 } });
    expect(storage.data.has('cc.settings.v1')).toBe(true);
  });

  it('reads the board colour and defaults to green for older saves', async () => {
    storage.data.set('cc.settings.v1', JSON.stringify({ v: 1, theme: 'dark', sound: true }));
    expect((await openStore()).getSettings().board).toBe('green');
    storage.data.set('cc.settings.v1', JSON.stringify({ v: 1, board: 'brown' }));
    expect((await openStore()).getSettings().board).toBe('brown');
  });

  it('falls back to defaults for corrupt or invalid data', async () => {
    storage.data.set('cc.settings.v1', '{not json');
    expect((await openStore()).getSettings().theme).toBe('system');
    storage.data.set('cc.settings.v1', JSON.stringify({ v: 1, theme: 'neon', sound: 'yes', levels: { italian: 999 }, depthOverride: 9 }));
    const settings = (await openStore()).getSettings();
    expect(settings).toMatchObject({ theme: 'system', sound: true, levels: { italian: 1400 } });
    expect(settings.depthOverride).toBeUndefined();
  });

  it('keeps working in memory when storage refuses writes', async () => {
    storage.failWrites = true;
    const store = await openStore();
    store.saveSettings({ ...store.getSettings(), quick: true });
    store.recordMoment(moment());
    expect(store.getSettings().quick).toBe(true);
    expect(store.getDepth('italian', 1400)).toBe(1);
  });

  it('keeps working when localStorage does not exist', async () => {
    vi.stubGlobal('localStorage', undefined);
    const store = await openStore();
    store.recordGame(summary(noon()));
    expect(store.getLastGame()?.gameId).toBe('italian-1400-0001');
  });
});

describe('migrate', () => {
  it('runs each step from the stored version up to the current one', () => {
    const steps = { 1: (d: Record<string, unknown>) => ({ ...d, a: 1 }), 2: (d: Record<string, unknown>) => ({ ...d, b: 2 }) };
    expect(migrate({ v: 1 }, 3, steps)).toEqual({ v: 3, a: 1, b: 2 });
    expect(migrate({ v: 2, a: 1 }, 3, steps)).toEqual({ v: 3, a: 1, b: 2 });
  });

  it('treats unversioned data as version 1 and returns current data untouched', () => {
    expect(migrate({ x: 1 }, 1)).toEqual({ x: 1 });
  });

  it('refuses data it cannot understand', () => {
    expect(migrate(null, 1)).toBeNull();
    expect(migrate([], 1)).toBeNull();
    expect(migrate({ v: 5 }, 2)).toBeNull();
    expect(migrate({ v: 1 }, 2)).toBeNull();
  });
});

describe('progress', () => {
  it('records moments and games and keeps them after a reload', async () => {
    let store = await openStore();
    const m = moment();
    store.recordMoment(m);
    store.recordGame(summary(noon(), [m]));
    store = await openStore();
    expect(store.getLastGame()?.moments).toEqual([m]);
    expect(store.playedGameIds('italian', 1400)).toEqual(['italian-1400-0001']);
    expect(store.getSetStats('italian', 1400).found).toEqual({ right: 1, total: 1 });
  });

  it('lists each played game once, per set', async () => {
    const store = await openStore();
    store.recordGame(summary(noon(), [], 'italian-1400-0001'));
    store.recordGame(summary(noon(), [], 'italian-1400-0001'));
    store.recordGame(summary(noon(), [], 'italian-1400-0002'));
    store.recordGame({ ...summary(noon(), [], 'italian-1700-0001'), level: 1700 });
    expect(store.playedGameIds('italian', 1400)).toEqual(['italian-1400-0001', 'italian-1400-0002']);
    expect(store.playedGameIds('italian', 1700)).toEqual(['italian-1700-0001']);
    expect(store.playedGameIds('caro-kann', 1400)).toEqual([]);
  });

  it('asks the browser for persistent storage after the first game only', async () => {
    const persist = vi.fn(async () => true);
    vi.stubGlobal('navigator', { storage: { persist } });
    const store = await openStore();
    store.recordMoment(moment());
    expect(persist).not.toHaveBeenCalled();
    store.recordGame(summary(noon()));
    store.recordGame(summary(noon(), [], 'italian-1400-0002'));
    expect(persist).toHaveBeenCalledTimes(1);
  });

  it('schedules a review for each moment', async () => {
    const store = await openStore();
    store.recordMoment(wrong({ at: noon() }));
    expect(store.dueReviews('italian', 1400, noon() + DAY / 2)).toEqual([]);
    expect(store.dueReviews('italian', 1400, noon() + DAY)).toHaveLength(1);
  });

  it('discards everything on reset', async () => {
    let store = await openStore();
    store.recordMoment(moment());
    store.recordGame(summary(noon()));
    store.resetProgress();
    expect(store.getLastGame()).toBeNull();
    store = await openStore();
    expect(store.getLastGame()).toBeNull();
    expect(store.getSetStats('italian', 1400).games).toBe(0);
  });
});

describe('depth', () => {
  async function playPauses(store: Store, held: number, total = 20): Promise<{ depthChanged?: number }> {
    let result: { depthChanged?: number } = {};
    for (let i = 0; i < total; i++) {
      result = store.recordMoment((i < held ? moment : wrong)({ ply: i * 2 + 1, at: noon() }));
    }
    return result;
  }

  it('moves up after 15 of 20 and remembers it', async () => {
    let store = await openStore();
    expect(await playPauses(store, 15)).toEqual({ depthChanged: 2 });
    expect(store.getDepth('italian', 1400)).toBe(2);
    expect(store.getDepth('italian', 1700)).toBe(1);
    store = await openStore();
    expect(store.getDepth('italian', 1400)).toBe(2);
  });

  it('returns the manual override and leaves the automatic depth alone', async () => {
    const store = await openStore();
    store.saveSettings({ ...store.getSettings(), depthOverride: 4 });
    expect(store.getDepth('italian', 1400)).toBe(4);
    expect(await playPauses(store, 20)).toEqual({});
    store.saveSettings({ ...store.getSettings(), depthOverride: undefined });
    expect(store.getDepth('italian', 1400)).toBe(1);
  });
});

describe('welcome back', () => {
  it('turns on two days after the last active day', async () => {
    const store = await openStore();
    expect(store.welcomeBack(noon())).toBe(false);
    store.recordGame(summary(noon(0)));
    expect(store.welcomeBack(noon(0))).toBe(false);
    expect(store.welcomeBack(noon(1))).toBe(false);
    expect(store.welcomeBack(noon(2))).toBe(true);
    expect(store.welcomeBack(noon(40))).toBe(true);
  });

  it('doubles the next game only', async () => {
    const store = await openStore();
    store.recordGame(summary(noon(0)));
    expect(store.getLastGameBonus()).toBe(false);

    store.recordMoment(moment({ at: noon(5) }));
    expect(store.welcomeBack(noon(5))).toBe(true);
    store.recordGame(summary(noon(5)));
    expect(store.getLastGameBonus()).toBe(true);
    expect(store.welcomeBack(noon(5))).toBe(false);

    store.recordGame(summary(noon(5), [], 'italian-1400-0002'));
    expect(store.getLastGameBonus()).toBe(false);
  });

  it('is not triggered by playing on consecutive days', async () => {
    const store = await openStore();
    store.recordGame(summary(noon(0)));
    store.recordGame(summary(noon(1)));
    store.recordGame(summary(noon(2)));
    expect(store.getLastGameBonus()).toBe(false);
    expect(store.welcomeBack(noon(3))).toBe(false);
  });

  it('survives a reload before the game is finished', async () => {
    let store = await openStore();
    store.recordGame(summary(noon(0)));
    store.recordMoment(moment({ at: noon(4) }));
    store = await openStore();
    expect(store.welcomeBack(noon(4))).toBe(true);
    store.recordGame(summary(noon(4)));
    expect(store.getLastGameBonus()).toBe(true);
  });
});

describe('backup round trip', () => {
  it('restores settings and progress from an export', async () => {
    const source = await openStore();
    source.saveSettings({ ...source.getSettings(), theme: 'light', depthOverride: 3 });
    source.recordMoment(moment());
    source.recordGame(summary(noon(), [moment()]));
    const text = source.exportProgress();

    storage.data.clear();
    const target = await openStore();
    expect(target.importProgress(text)).toEqual({ ok: true });
    expect(target.getSettings()).toMatchObject({ theme: 'light', depthOverride: 3 });
    expect(target.playedGameIds('italian', 1400)).toHaveLength(1);
    expect((await openStore()).getSettings().theme).toBe('light');
  });

  it('rejects a bad file without touching current data', async () => {
    const store = await openStore();
    store.recordGame(summary(noon()));
    expect(store.importProgress('nope')).toMatchObject({ ok: false });
    expect(store.playedGameIds('italian', 1400)).toHaveLength(1);
  });
});

describe('install hint', () => {
  it('remembers a dismissal', async () => {
    let store = await openStore();
    expect(store.isInstallHintDismissed()).toBe(false);
    store.dismissInstallHint();
    store = await openStore();
    expect(store.isInstallHintDismissed()).toBe(true);
  });
});
