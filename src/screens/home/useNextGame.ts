import { useEffect, useState } from 'preact/hooks';
import { loadGame, loadSet } from '../../content/loader';
import type { Level, OpeningId } from '../../content/types';
import { playedGameIds } from '../../progress/store';
import { keyPositions, pickNextGame, type NextGame } from './nextGame';

export type NextGameState =
  | { status: 'loading' }
  | { status: 'soon' }
  | { status: 'error' }
  | { status: 'ready'; next: NextGame; positions: number | null };

async function load(opening: OpeningId, level: Level): Promise<NextGameState> {
  const set = await loadSet(opening, level);
  const next = set && pickNextGame(set, playedGameIds(opening, level));
  if (!next) return { status: 'soon' };
  const positions = await loadGame(opening, level, next.id).then(keyPositions, () => null);
  return { status: 'ready', next, positions };
}

/** What the Play button needs to know: is there a game for this set, and which one is next. */
export function useNextGame(opening: OpeningId, level: Level): NextGameState {
  const [state, setState] = useState<NextGameState>({ status: 'loading' });
  useEffect(() => {
    let current = true;
    const settle = (next: NextGameState) => current && setState(next);
    setState({ status: 'loading' });
    load(opening, level)
      .then(settle)
      // A host that answers a missing file with a web page also means "no content yet".
      .catch((e) => settle({ status: e instanceof SyntaxError ? 'soon' : 'error' }));
    return () => {
      current = false;
    };
  }, [opening, level]);
  return state;
}
