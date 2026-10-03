import { useEffect, useState } from 'preact/hooks';
import { loadSet } from '../../content/loader';
import type { Level, OpeningId } from '../../content/types';

export type SetStatus = 'loading' | 'ready' | 'soon' | 'error';

async function load(opening: OpeningId, level: Level): Promise<SetStatus> {
  const set = await loadSet(opening, level);
  return set && set.games.length > 0 ? 'ready' : 'soon';
}

/** Whether the Play button has games to open for this set. */
export function useSetStatus(opening: OpeningId, level: Level): SetStatus {
  const [status, setStatus] = useState<SetStatus>('loading');
  useEffect(() => {
    let current = true;
    const settle = (next: SetStatus) => current && setStatus(next);
    setStatus('loading');
    load(opening, level)
      .then(settle)
      // A host that answers a missing file with a web page also means "no content yet".
      .catch((e) => settle(e instanceof SyntaxError ? 'soon' : 'error'));
    return () => {
      current = false;
    };
  }, [opening, level]);
  return status;
}
