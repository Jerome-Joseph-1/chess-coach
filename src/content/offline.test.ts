import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { downloadSet, isSetOffline } from './offline';

const BASE = '/chess-coach/content/italian-1400';
const IDS = ['italian-1400-0001', 'italian-1400-0002', 'italian-1400-0003', 'italian-1400-0004', 'italian-1400-0005', 'italian-1400-0006'];

class FakeCache {
  entries = new Map<string, Response>();

  async put(url: string, res: Response): Promise<void> {
    this.entries.set(url, res);
  }

  async match(url: string): Promise<Response | undefined> {
    return this.entries.get(url)?.clone();
  }
}

let cache: FakeCache;
let opened: string[];
let inFlight: number;
let peak: number;
let failing: Set<string>;
let served: Map<string, unknown>;

function files(): Map<string, unknown> {
  const map = new Map<string, unknown>();
  map.set(`${BASE}/index.json`, { opening: 'italian', level: 1400, side: 'w', start: [], games: IDS.map((id) => ({ id, moves: [] })) });
  for (const id of IDS) map.set(`${BASE}/games/${id}.json`, { id });
  return map;
}

const BORROWED = '/chess-coach/content/italian-1100/games/italian-1100-0007.json';

/** A course whose lessons use two of the set's games and one game of another level. */
function serveCourse(): void {
  const ref = (set: string, gameId: string) => ({ set, gameId, ply: 3, findShare: 0.5 });
  const unit = {
    id: 'fork',
    examples: [ref('italian-1100', 'italian-1100-0007')],
    drills: [ref('italian-1400', IDS[0]), ref('italian-1400', IDS[1]), ref('italian-1100', 'italian-1100-0007')],
  };
  served.set(`${BASE}/course.json`, { v: 1, opening: 'italian', level: 1400, units: [unit] });
  served.set(BORROWED, { id: 'italian-1100-0007' });
}

beforeEach(() => {
  cache = new FakeCache();
  opened = [];
  inFlight = 0;
  peak = 0;
  failing = new Set();
  served = files();
  vi.stubGlobal('caches', {
    open: async (name: string) => {
      opened.push(name);
      return cache;
    },
  });
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      inFlight += 1;
      peak = Math.max(peak, inFlight);
      await new Promise((resolve) => setTimeout(resolve, 1));
      inFlight -= 1;
      const body = served.get(url);
      if (failing.has(url)) return new Response('down', { status: 503 });
      if (body === undefined) return new Response('nope', { status: 404 });
      return new Response(JSON.stringify(body), { status: 200 });
    }),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('downloadSet', () => {
  it('stores the index and every game in the content cache', async () => {
    await downloadSet('italian', 1400, () => {});
    expect(opened).toEqual(['content']);
    expect([...cache.entries.keys()].sort()).toEqual([`${BASE}/index.json`, ...IDS.map((id) => `${BASE}/games/${id}.json`)].sort());
  });

  it('reports progress from 0 up to the number of games', async () => {
    const seen: [number, number][] = [];
    await downloadSet('italian', 1400, (done, total) => seen.push([done, total]));
    expect(seen[0]).toEqual([0, IDS.length]);
    expect(seen.at(-1)).toEqual([IDS.length, IDS.length]);
    expect(seen.map(([done]) => done)).toEqual([0, 1, 2, 3, 4, 5, 6]);
  });

  it('also stores the course and the games of other levels its lessons use, each once', async () => {
    serveCourse();
    const seen: [number, number][] = [];
    await downloadSet('italian', 1400, (done, total) => seen.push([done, total]));
    expect(cache.entries.has(`${BASE}/course.json`)).toBe(true);
    expect(cache.entries.has(BORROWED)).toBe(true);
    expect(seen.at(-1)).toEqual([IDS.length + 1, IDS.length + 1]);
  });

  it('rejects when the course is there but cannot be fetched', async () => {
    serveCourse();
    failing.add(`${BASE}/course.json`);
    await expect(downloadSet('italian', 1400, () => {})).rejects.toThrow();
  });

  it('rejects when a game of another level that a lesson uses cannot be fetched', async () => {
    serveCourse();
    failing.add(BORROWED);
    await expect(downloadSet('italian', 1400, () => {})).rejects.toThrow();
  });

  it('downloads a few files at a time', async () => {
    await downloadSet('italian', 1400, () => {});
    expect(peak).toBeGreaterThan(1);
    expect(peak).toBeLessThanOrEqual(4);
  });

  it('rejects when a file cannot be fetched and the set does not count as offline', async () => {
    failing.add(`${BASE}/games/${IDS[3]}.json`);
    await expect(downloadSet('italian', 1400, () => {})).rejects.toThrow();
    expect(await isSetOffline('italian', 1400)).toBe(false);
  });

  it('rejects when there is no index for the set', async () => {
    await expect(downloadSet('caro-kann', 1100, () => {})).rejects.toThrow();
  });

  it('rejects when Cache Storage is unavailable', async () => {
    vi.stubGlobal('caches', undefined);
    await expect(downloadSet('italian', 1400, () => {})).rejects.toThrow('not available');
  });
});

describe('isSetOffline', () => {
  it('is false before a download and true after', async () => {
    expect(await isSetOffline('italian', 1400)).toBe(false);
    await downloadSet('italian', 1400, () => {});
    expect(await isSetOffline('italian', 1400)).toBe(true);
  });

  it('is false while a game file is missing', async () => {
    await downloadSet('italian', 1400, () => {});
    cache.entries.delete(`${BASE}/games/${IDS[2]}.json`);
    expect(await isSetOffline('italian', 1400)).toBe(false);
  });

  it('is false when only the index is stored', async () => {
    await cache.put(`${BASE}/index.json`, new Response(JSON.stringify({ games: [{ id: IDS[0] }] })));
    expect(await isSetOffline('italian', 1400)).toBe(false);
  });

  it('only counts the requested set', async () => {
    await downloadSet('italian', 1400, () => {});
    expect(await isSetOffline('italian', 1700)).toBe(false);
    expect(await isSetOffline('caro-kann', 1400)).toBe(false);
  });

  it('is false when Cache Storage is missing, throws or holds a broken index', async () => {
    vi.stubGlobal('caches', undefined);
    expect(await isSetOffline('italian', 1400)).toBe(false);
    vi.stubGlobal('caches', { open: async () => Promise.reject(new Error('denied')) });
    expect(await isSetOffline('italian', 1400)).toBe(false);
    vi.stubGlobal('caches', { open: async () => cache });
    await cache.put(`${BASE}/index.json`, new Response('<html>'));
    expect(await isSetOffline('italian', 1400)).toBe(false);
  });
});
