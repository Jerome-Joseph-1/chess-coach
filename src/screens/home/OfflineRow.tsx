import { useEffect, useState } from 'preact/hooks';
import { downloadSet, isSetOffline } from '../../content/offline';
import type { Level, OpeningId } from '../../content/types';
import { Button } from '../../ui/Button';
import { disabledIf } from '../shared/disabledIf';
import { Check } from '../shared/icons';

type OfflineState =
  | { kind: 'checking' }
  | { kind: 'idle' }
  | { kind: 'downloading'; done: number; total: number }
  | { kind: 'done' }
  | { kind: 'error' };

/** Saves the set's games on the device so it plays without a connection. */
export function OfflineRow({ opening, level, disabled }: { opening: OpeningId; level: Level; disabled: boolean }) {
  const [state, setState] = useState<OfflineState>({ kind: 'checking' });

  useEffect(() => {
    let current = true;
    setState({ kind: 'checking' });
    isSetOffline(opening, level).then((ready) => current && setState({ kind: ready ? 'done' : 'idle' }));
    return () => {
      current = false;
    };
  }, [opening, level]);

  const start = () => {
    setState({ kind: 'downloading', done: 0, total: 1 });
    downloadSet(opening, level, (done, total) => setState({ kind: 'downloading', done, total }))
      .then(() => setState({ kind: 'done' }))
      .catch(() => setState({ kind: 'error' }));
  };

  if (state.kind === 'downloading') {
    return (
      <div class="offline" role="status">
        <span class="muted">
          Downloading {state.done} of {state.total}
        </span>
        <div class="meter" role="progressbar" aria-valuemin={0} aria-valuemax={state.total} aria-valuenow={state.done}>
          <div class="meter-fill" style={{ '--r': state.done / state.total }} />
        </div>
      </div>
    );
  }
  if (state.kind === 'done') {
    return (
      <p class="offline offline-done" role="status">
        <Check size={16} />
        Available offline
      </p>
    );
  }
  return (
    <div class="offline">
      {state.kind === 'error' && <span class="muted">Download failed. Check your connection and try again.</span>}
      <Button variant="ghost" {...disabledIf(disabled || state.kind === 'checking')} onClick={start}>
        Download for offline
      </Button>
    </div>
  );
}
