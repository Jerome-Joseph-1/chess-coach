import { useEffect, useState } from 'preact/hooks';
import type { GameSummary, MomentResult } from '../content/types';
import { isRight } from '../progress/moments';
import { getLastGame, getLastGameBonus } from '../progress/store';
import { navigate } from '../router';
import { Button } from '../ui/Button';
import { celebrate } from '../ui/rewards';
import { momentLabel, outcomeText, playPath, reviewPath } from './shared/labels';
import './shared/screen.css';
import './recap.css';

const STAR_TICK_MS = 120;
const FIRST_TICK_MS = 400;
const MAX_COUNT_MS = 2400;
const STARS_PER_MOMENT = 3;

function prefersReducedMotion(): boolean {
  return matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/** Counts 0..total one star at a time. */
function useCountUp(total: number): number {
  const [count, setCount] = useState(() => (prefersReducedMotion() ? total : 0));
  useEffect(() => {
    if (count >= total) return;
    const delay = count === 0 ? FIRST_TICK_MS : Math.min(STAR_TICK_MS, MAX_COUNT_MS / total);
    const id = setTimeout(() => setCount(count + 1), delay);
    return () => clearTimeout(id);
  }, [count, total]);
  return count;
}

function TypeIcon({ type }: { type: MomentResult['type'] }) {
  const paths = {
    pause: <path d="M9 6v12M15 6v12" />,
    nothing: <path d="M5 13c3 3 11 3 14 0" />,
    silent: (
      <>
        <path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z" />
        <circle cx="12" cy="12" r="2.5" />
      </>
    ),
  };
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      {paths[type]}
    </svg>
  );
}

function Stars({ count }: { count: number }) {
  const slots = Math.max(STARS_PER_MOMENT, count);
  return (
    <span class="moment-stars" role="img" aria-label={`${count} of ${slots} stars`}>
      {'●'.repeat(count)}
      <span class="moment-stars-empty">{'○'.repeat(slots - count)}</span>
    </span>
  );
}

function MomentRow({ m, index }: { m: MomentResult; index: number }) {
  const right = isRight(m);
  return (
    <li class="moment" style={{ '--i': index }}>
      <span class={`moment-icon ${right ? 'moment-icon--right' : 'moment-icon--missed'}`}>
        <TypeIcon type={m.type} />
      </span>
      <div class="moment-text">
        <span class="moment-title">
          Move {m.moveNo} · {momentLabel(m)}
        </span>
        <span class="moment-meta">
          <span class="moment-outcome">{outcomeText(m)}</span>
          <Stars count={m.stars} />
        </span>
        <a class="link-button moment-again" href={`#${reviewPath(m)}`}>
          See it again
        </a>
      </div>
    </li>
  );
}

function RecapBody({ game, bonus }: { game: GameSummary; bonus: boolean }) {
  const base = game.moments.reduce((sum, m) => sum + m.stars, 0);
  const total = bonus ? base * 2 : base;
  const shown = useCountUp(total);
  const perfect = game.moments.length > 0 && game.moments.every(isRight);
  const counted = shown >= total;

  useEffect(() => {
    if (counted && perfect) celebrate('perfect');
  }, [counted]);

  return (
    <main class="screen recap">
      <header class="recap-head">
        <h1>Game complete</h1>
        <p class="recap-total" aria-label={`${total} stars`}>
          <span class="recap-star" aria-hidden="true">
            ★
          </span>
          <span class="recap-count" key={shown} aria-hidden="true">
            {shown}
          </span>
        </p>
        {bonus && <span class="chip chip--good">Welcome-back bonus ×2</span>}
        {perfect && <p class="recap-perfect">Every moment right.</p>}
      </header>
      {game.moments.length === 0 ? (
        <p class="muted recap-quiet">No pauses came up in this game.</p>
      ) : (
        <ol class="moments">
          {game.moments.map((m, i) => (
            <MomentRow key={`${m.gameId}:${m.ply}`} m={m} index={i} />
          ))}
        </ol>
      )}
      <div class="recap-actions">
        <Button size="lg" onClick={() => navigate(playPath(game.opening, game.level))}>
          Next game
        </Button>
        <Button size="lg" variant="secondary" onClick={() => navigate('/')}>
          Home
        </Button>
      </div>
    </main>
  );
}

function EmptyRecap() {
  return (
    <main class="screen recap">
      <div class="recap-empty">
        <svg width="96" height="96" viewBox="0 0 96 96" aria-hidden="true">
          <circle cx="48" cy="48" r="46" fill="var(--surface-2)" />
          <circle cx="48" cy="30" r="9" fill="var(--accent)" />
          <rect x="39" y="40" width="18" height="6" rx="3" fill="var(--accent)" />
          <path d="M41 46h14c0 9 5 15 9 23H32c4-8 9-14 9-23z" fill="var(--accent)" />
          <rect x="27" y="69" width="42" height="8" rx="4" fill="var(--accent-lip)" />
        </svg>
        <h1>No game to look back on yet</h1>
        <p class="muted">Finish a game and your recap shows up here.</p>
        <Button size="lg" onClick={() => navigate('/')}>
          Pick a game
        </Button>
      </div>
    </main>
  );
}

export function Recap() {
  const game = getLastGame();
  return game ? <RecapBody game={game} bonus={getLastGameBonus()} /> : <EmptyRecap />;
}
