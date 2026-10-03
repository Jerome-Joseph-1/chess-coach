import { describe, expect, it } from 'vitest';
import { createBackup, parseBackup } from './backup';
import { DEFAULT_SETTINGS, MOMENT_CAP, emptyProgress } from './model';
import { moment, noon } from './testkit';

function backupText(progress: unknown, settings: unknown = DEFAULT_SETTINGS, extra: object = {}): string {
  return JSON.stringify({ app: 'chess-coach', version: 1, exportedAt: 'x', settings, progress, ...extra });
}

describe('backup validation', () => {
  it('accepts what it exports', () => {
    const progress = { ...emptyProgress(), moments: [moment()], days: ['2026-06-01'], armed: true };
    const settings = { ...DEFAULT_SETTINGS, depthOverride: 2 as const };
    const result = parseBackup(JSON.stringify(createBackup(settings, progress, noon())));
    expect(result).toEqual({ ok: true, settings, progress });
  });

  it.each([
    ['text that is not JSON', 'hello'],
    ['JSON that is not an object', '[1, 2]'],
    ['a different app', JSON.stringify({ app: 'other', progress: {} })],
    ['a missing progress section', backupText(undefined)],
    ['a progress section of the wrong type', backupText('lots')],
    ['a newer backup version', backupText({}, DEFAULT_SETTINGS, { version: 9 })],
  ])('rejects %s', (_name, text) => {
    expect(parseBackup(text)).toMatchObject({ ok: false });
  });

  it('drops malformed entries and keeps the good ones', () => {
    const good = moment();
    const progress = {
      v: 1,
      moments: [good, { ...good, depth: 9 }, { ...good, opening: 'sicilian' }, 'junk', null, { ...good, at: 'now' }],
      games: [{ opening: 'italian', level: 1400, gameId: 'g', at: 1 }, { opening: 'italian' }],
      reviews: [{ opening: 'italian', level: 1400, gameId: 'g', ply: 1, box: 2, due: 5, type: 'pause' }, { box: 99 }],
      days: ['2026-06-02', '2026-06-01', '2026-06-01', 'yesterday', 7],
      depth: { 'italian-1400': { depth: 3, window: [{ key: 'a', held: true }, { key: 'b' }] }, nonsense: { depth: 2 } },
    };
    const result = parseBackup(backupText(progress));
    if (!result.ok) throw new Error(result.error);
    expect(result.progress.moments).toEqual([good]);
    expect(result.progress.games).toHaveLength(1);
    expect(result.progress.reviews).toHaveLength(1);
    expect(result.progress.days).toEqual(['2026-06-01', '2026-06-02']);
    expect(result.progress.depth).toEqual({ 'italian-1400': { depth: 3, window: [{ key: 'a', held: true }] } });
    expect(result.progress.armed).toBe(false);
    expect(result.progress.lastGame).toBeNull();
  });

  it('keeps only the newest moments past the cap', () => {
    const moments = Array.from({ length: MOMENT_CAP + 10 }, (_, i) => moment({ ply: i }));
    const result = parseBackup(backupText({ v: 1, moments }));
    if (!result.ok) throw new Error(result.error);
    expect(result.progress.moments).toHaveLength(MOMENT_CAP);
    expect(result.progress.moments[0].ply).toBe(10);
  });

  it('repairs invalid settings instead of failing', () => {
    const result = parseBackup(backupText({ v: 1 }, { theme: 'neon', board: 'purple', sound: false, depthOverride: 4, levels: { 'caro-kann': 2000, italian: 5 } }));
    if (!result.ok) throw new Error(result.error);
    expect(result.settings).toEqual({
      theme: 'system', board: 'green', sound: false, haptics: true, quick: false, everyNote: false, depthOverride: 4, levels: { italian: 1400, 'caro-kann': 2000 },
    });
  });
});
