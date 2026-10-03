import { CONTENT_URL, gameUrl, setKey } from './loader';
import type { Level, OpeningId, SetIndex } from './types';

// The service worker's runtime cache uses this name, so both read the same files.
const CACHE_NAME = 'content';
const PARALLEL_DOWNLOADS = 4;

function indexUrl(opening: OpeningId, level: Level): string {
  return `${CONTENT_URL}${setKey(opening, level)}/index.json`;
}

async function fetchInto(cache: Cache, url: string): Promise<Response> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Could not download ${url}`);
  await cache.put(url, res.clone());
  return res;
}

/** Stores the set's index and every game file so the set plays without a connection. */
export async function downloadSet(opening: OpeningId, level: Level, onProgress: (done: number, total: number) => void): Promise<void> {
  if (typeof caches === 'undefined') throw new Error('Offline storage is not available here');
  const cache = await caches.open(CACHE_NAME);
  const index: SetIndex = await (await fetchInto(cache, indexUrl(opening, level))).json();
  const urls = index.games.map((g) => gameUrl(opening, level, g.id));
  let done = 0;
  onProgress(done, urls.length);
  for (let i = 0; i < urls.length; i += PARALLEL_DOWNLOADS) {
    await Promise.all(
      urls.slice(i, i + PARALLEL_DOWNLOADS).map(async (url) => {
        await fetchInto(cache, url);
        onProgress(++done, urls.length);
      }),
    );
  }
}

export async function isSetOffline(opening: OpeningId, level: Level): Promise<boolean> {
  if (typeof caches === 'undefined') return false;
  try {
    const cache = await caches.open(CACHE_NAME);
    const cachedIndex = await cache.match(indexUrl(opening, level));
    if (!cachedIndex) return false;
    const index: SetIndex = await cachedIndex.json();
    const games = await Promise.all(index.games.map((g) => cache.match(gameUrl(opening, level, g.id))));
    return games.every(Boolean);
  } catch {
    return false;
  }
}
