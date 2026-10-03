import { useEffect } from 'preact/hooks';
import type { GameSummary, MomentResult } from '../content/types';
import { isRight } from '../progress/moments';
import { getLastGame, getLastGameBonus } from '../progress/store';
import { navigate } from '../router';
import { Button } from '../ui/Button';
import { celebrate } from '../ui/rewards';
import { Check, Cross } from './shared/icons';
import { OPENING_TITLES, momentLabel, outcomeText, playPath, ratingLine, reviewPath } from './shared/labels';
import { RollingNumber } from './shared/RollingNumber';
import './shared/screen.css';
import './recap.css';

// Let the stars roll in before the confetti.
const CELEBRATE_DELAY_MS = 700;

// Coming back to the recap later in the same session must not celebrate the same game twice.
let celebratedGameAt: number | null = null;

function MomentRow({ m, index }: { m: MomentResult; index: number }) {
  const right = isRight(m);
  return (
    <li class="row moment" style={{ '--i': index }}>
      <span class={`moment-mark ${right ? 'moment-mark--right' : 'moment-mark--missed'}`}>{right ? <Check size={16} /> : <Cross size={16} />}</span>
      <span class="row-main">
        <span class="moment-title">
          Move {m.moveNo} · {momentLabel(m)}
        </span>
        <span class="row-sub">{outcomeText(m)}</span>
      </span>
      <a class="link" href={`#${reviewPath(m)}`}>
        See it again
      </a>
    </li>
  );
}

function usePerfectCelebration(game: GameSummary, perfect: boolean): void {
  useEffect(() => {
    if (!perfect || celebratedGameAt === game.at) return;
    celebratedGameAt = game.at;
    const id = setTimeout(() => celebrate('perfect'), CELEBRATE_DELAY_MS);
    return () => clearTimeout(id);
  }, [game.at, perfect]);
}

function RecapBody({ game, bonus }: { game: GameSummary; bonus: boolean }) {
  const base = game.moments.reduce((sum, m) => sum + m.stars, 0);
  const stars = bonus ? base * 2 : base;
  const perfect = game.moments.length > 0 && game.moments.every(isRight);
  usePerfectCelebration(game, perfect);

  return (
    <main class="screen recap">
      <header class="recap-head">
        <h1>Game complete</h1>
        <p class="muted">
          {OPENING_TITLES[game.opening]} · {ratingLine(game.level)}
        </p>
        <p class="recap-stars">
          <span class="recap-star" aria-hidden="true">
            ★
          </span>
          <RollingNumber value={stars} />
          <span class="recap-stars-unit">{stars === 1 ? 'star' : 'stars'}</span>
        </p>
        {bonus && <span class="tag">Welcome back: stars counted double</span>}
      </header>

      <h2 class="section-label">Key positions</h2>
      {game.moments.length === 0 ? (
        <p class="card recap-quiet muted">No key positions came up in this game.</p>
      ) : (
        <ol class="card list">
          {game.moments.map((m, i) => (
            <MomentRow key={`${m.gameId}:${m.ply}`} m={m} index={i} />
          ))}
        </ol>
      )}

      <div class="recap-actions">
        <Button size="lg" onClick={() => navigate(playPath(game.opening, game.level))}>
          Play next game
        </Button>
        <Button size="lg" variant="secondary" onClick={() => navigate('/')}>
          Back to Today
        </Button>
      </div>
    </main>
  );
}

function EmptyRecap() {
  return (
    <main class="screen recap">
      <div class="recap-empty">
        <h1>No game to look back on yet</h1>
        <p class="muted">Finish a game and the recap shows up here.</p>
        <Button size="lg" onClick={() => navigate('/')}>
          Back to Today
        </Button>
      </div>
    </main>
  );
}

export function Recap() {
  const game = getLastGame();
  return game ? <RecapBody game={game} bonus={getLastGameBonus()} /> : <EmptyRecap />;
}
