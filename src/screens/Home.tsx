import { useEffect, useState } from 'preact/hooks';
import { LEVELS, OPENINGS, type Opening } from '../content/catalog';
import { loadSet } from '../content/loader';
import { downloadSet, isSetOffline } from '../content/offline';
import type { Level } from '../content/types';
import { DEPTH_NAMES } from '../progress/depth';
import { percent } from '../progress/stats';
import { dueReviews, getDepth, getSetStats, getSettings, saveSettings, welcomeBack } from '../progress/store';
import { navigate } from '../router';
import { Button } from '../ui/Button';
import { InstallHint } from '../ui/InstallHint';
import { TabBar } from '../ui/TabBar';
import { playPath, reviewPath } from './shared/labels';
import { Segmented } from './shared/Segmented';
import './shared/screen.css';
import './home.css';

type SetStatus = 'loading' | 'ready' | 'soon' | 'error';

const LEVEL_OPTIONS = LEVELS.map((value) => ({ value, label: String(value) }));

// ButtonProps does not list `disabled` although the button element takes it.
const disabledIf = (disabled: boolean) => ({ disabled });

function useSetStatus(opening: Opening, level: Level): SetStatus {
  const [status, setStatus] = useState<SetStatus>('loading');
  useEffect(() => {
    let current = true;
    const settle = (next: SetStatus) => current && setStatus(next);
    setStatus('loading');
    loadSet(opening.id, level)
      .then((set) => settle(set ? 'ready' : 'soon'))
      // A host that answers a missing file with a web page is also "no content yet".
      .catch((e) => settle(e instanceof SyntaxError ? 'soon' : 'error'));
    return () => {
      current = false;
    };
  }, [opening.id, level]);
  return status;
}

type OfflineState =
  | { kind: 'checking' }
  | { kind: 'idle' }
  | { kind: 'downloading'; done: number; total: number }
  | { kind: 'done' }
  | { kind: 'error' };

function OfflineAction({ opening, level, disabled }: { opening: Opening; level: Level; disabled: boolean }) {
  const [state, setState] = useState<OfflineState>({ kind: 'checking' });

  useEffect(() => {
    let current = true;
    isSetOffline(opening.id, level).then((ready) => current && setState({ kind: ready ? 'done' : 'idle' }));
    return () => {
      current = false;
    };
  }, [opening.id, level]);

  const start = () => {
    setState({ kind: 'downloading', done: 0, total: 1 });
    downloadSet(opening.id, level, (done, total) => setState({ kind: 'downloading', done, total }))
      .then(() => setState({ kind: 'done' }))
      .catch(() => setState({ kind: 'error' }));
  };

  if (state.kind === 'downloading') {
    return (
      <div class="offline" role="status">
        <div class="progress-track offline-track" role="progressbar" aria-valuemin={0} aria-valuemax={state.total} aria-valuenow={state.done}>
          <div class="progress-fill" style={{ width: `${(100 * state.done) / state.total}%` }} />
        </div>
        <span class="muted">
          Downloading {state.done} of {state.total}
        </span>
      </div>
    );
  }
  if (state.kind === 'done') {
    return (
      <p class="offline offline-done" role="status">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <path d="m5 12.5 4.5 4.5L19 7.5" />
        </svg>
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

function statsLine(games: number, found: number | null): string {
  if (games === 0) return 'No games yet';
  const played = `${games} ${games === 1 ? 'game' : 'games'}`;
  return found === null ? played : `${played} · ${found}% found`;
}

function OpeningCard({ opening, level, onLevel }: { opening: Opening; level: Level; onLevel: (level: Level) => void }) {
  const status = useSetStatus(opening, level);
  const depth = getDepth(opening.id, level);
  const stats = getSetStats(opening.id, level);
  const due = dueReviews(opening.id, level, Date.now());
  const side = opening.side === 'w' ? 'White' : 'Black';
  return (
    <section class="card opening-card" aria-labelledby={`${opening.id}-name`}>
      <div>
        <h2 id={`${opening.id}-name`}>{opening.name}</h2>
        <p class="opening-side">
          <span class={`side-disc side-disc--${opening.side}`} aria-hidden="true" />
          You play {side}
        </p>
      </div>
      <Segmented label={`${opening.name} level`} options={LEVEL_OPTIONS} value={level} onChange={onLevel} />
      <div class="opening-chips">
        <span class="chip" key={`${level}-${depth}`}>
          Step {depth} · {DEPTH_NAMES[depth]}
        </span>
        {due.length > 0 && (
          <button type="button" class="chip chip--good" key={`due-${level}`} onClick={() => navigate(reviewPath(due[0]))}>
            {due.length} {due.length === 1 ? 'review' : 'reviews'} due
          </button>
        )}
      </div>
      <p class="opening-stats">{statsLine(stats.games, percent(stats.found))}</p>
      <Button size="lg" {...disabledIf(status !== 'ready')} onClick={() => navigate(playPath(opening.id, level))}>
        {status === 'soon' ? 'Coming soon' : 'Play'}
      </Button>
      {status === 'error' && <p class="opening-stats">Can't reach the games right now. Check your connection.</p>}
      <OfflineAction key={level} opening={opening} level={level} disabled={status !== 'ready'} />
    </section>
  );
}

export function Home() {
  const [settings, setSettings] = useState(getSettings);

  const chooseLevel = (opening: Opening, level: Level) => {
    saveSettings({ ...settings, levels: { ...settings.levels, [opening.id]: level } });
    setSettings(getSettings());
  };

  return (
    <main class="screen screen--tabs">
      <header class="home-head">
        <h1>Chess Coach</h1>
        <p>Spot what matters in real games.</p>
      </header>
      <InstallHint />
      {welcomeBack(Date.now()) && (
        <aside class="welcome">
          <span class="welcome-star" aria-hidden="true">
            ★
          </span>
          <p>
            <strong>Welcome back!</strong> Your next game earns double stars.
          </p>
        </aside>
      )}
      <div class="stack">
        {OPENINGS.map((opening) => (
          <OpeningCard key={opening.id} opening={opening} level={settings.levels[opening.id]} onLevel={(level) => chooseLevel(opening, level)} />
        ))}
      </div>
      <TabBar current="home" />
    </main>
  );
}
