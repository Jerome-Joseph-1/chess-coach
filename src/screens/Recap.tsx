import type { ComponentChildren } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import { loadGame } from '../content/loader';
import { lessonFor } from '../learn';
import type { GameSummary, MomentResult, Turn } from '../content/types';
import { isRight } from '../progress/moments';
import { clearLastGameUnlock, getLastGame, getLastGameBonus, getLastGameUnlock } from '../progress/store';
import { navigate } from '../router';
import { Button } from '../ui/Button';
import { LevelUp } from '../ui/LevelUp';
import { celebrate } from '../ui/rewards';
import { playSound } from '../ui/sound';
import { handledWell, momentSub, momentTitle, momentTone, type MomentTone } from './recap/moments';
import { Check, Chevron, Cross, Dash } from './shared/icons';
import { playPath, reviewPath } from './shared/labels';
import { RollingNumber } from './shared/RollingNumber';
import './shared/screen.css';
import './recap.css';

// Let the numbers roll in before the confetti.
const CELEBRATE_DELAY_MS = 700;

// Coming back to the recap later in the same session must not celebrate the same game twice.
let celebratedGameAt: number | null = null;
let endedGameAt: number | null = null;

const MARKS: Record<MomentTone, ComponentChildren> = {
  right: <Check size={14} />,
  missed: <Cross size={14} />,
  quiet: <Dash size={14} />,
};

interface KnownTurn {
  turn: Turn;
  pattern: string;
}

function MomentRow({ m, known, index }: { m: MomentResult; known?: KnownTurn; index: number }) {
  const tone = momentTone(m);
  const contents = (
    <>
      <span class={`mark mark--${tone}`} aria-hidden="true">
        {MARKS[tone]}
      </span>
      <span class="row-main">
        <span class="moment-title">{momentTitle(m, known?.turn, known?.pattern)}</span>
        <span class={`row-sub moment-sub--${tone}`}>{momentSub(m)}</span>
      </span>
      {tone === 'missed' && (
        <>
          <span class="moment-again">See it again</span>
          <Chevron />
        </>
      )}
    </>
  );
  return (
    <li style={{ '--i': index }}>
      {tone === 'missed' ? (
        <a class="row moment" href={`#${reviewPath(m)}`}>
          {contents}
        </a>
      ) : (
        <div class="row moment">{contents}</div>
      )}
    </li>
  );
}

/** The game file names each position's pattern; without it the titles stay general. */
function useTurns(game: GameSummary): Map<number, KnownTurn> {
  const [turns, setTurns] = useState(new Map<number, KnownTurn>());
  useEffect(() => {
    if (game.moments.length === 0) return;
    let current = true;
    loadGame(game.opening, game.level, game.gameId)
      .then((data) => current && setTurns(new Map(data.turns.map((turn, i) => [turn.ply, { turn, pattern: lessonFor(data, i).name }]))))
      .catch(() => {});
    return () => {
      current = false;
    };
  }, [game.opening, game.level, game.gameId, game.moments.length]);
  return turns;
}

function useEndSound(game: GameSummary): void {
  useEffect(() => {
    if (endedGameAt === game.at) return;
    endedGameAt = game.at;
    playSound('end');
  }, [game.at]);
}

function usePerfectCelebration(game: GameSummary, perfect: boolean): void {
  useEffect(() => {
    if (!perfect || celebratedGameAt === game.at) return;
    celebratedGameAt = game.at;
    const id = setTimeout(() => celebrate('perfect'), CELEBRATE_DELAY_MS);
    return () => clearTimeout(id);
  }, [game.at, perfect]);
}

function Summary({ moments, bonus }: { moments: MomentResult[]; bonus: boolean }) {
  if (moments.length === 0) {
    return <p class="card recap-quiet muted">No key positions came up in this game.</p>;
  }
  const { right, total } = handledWell(moments);
  return (
    <section class="card summary" aria-label="Result">
      <p class="summary-number">
        <RollingNumber value={right} />
        <span class="summary-of"> of </span>
        <RollingNumber value={total} />
      </p>
      <p class="muted">key positions handled well</p>
      <div class="result-bar" aria-hidden="true">
        {moments.map((m, i) => (
          <i key={`${m.gameId}:${m.ply}`} class={isRight(m) ? 'right' : 'missed'} style={{ '--i': i }} />
        ))}
      </div>
      {bonus && (
        <p class="welcome">
          <span class="due-dot" aria-hidden="true" />
          Welcome back: this game counts double
        </p>
      )}
    </section>
  );
}

function RecapBody({ game, bonus }: { game: GameSummary; bonus: boolean }) {
  const turns = useTurns(game);
  const [unlocked, setUnlocked] = useState(getLastGameUnlock);
  const perfect = game.moments.some((m) => m.type !== 'nothing') && game.moments.every(isRight);
  useEndSound(game);
  usePerfectCelebration(game, perfect && !unlocked);

  const closeLevelUp = () => {
    clearLastGameUnlock();
    setUnlocked(null);
  };

  return (
    <main class="screen recap">
      <header class="topbar">
        <h1 class="screen-title">Game complete</h1>
        <a class="round-button" href="#/" aria-label="Close">
          <Cross />
        </a>
      </header>

      <div class="stack">
        <Summary moments={game.moments} bonus={bonus} />
        {game.moments.length > 0 && (
          <ol class="card list" aria-label="Key positions">
            {game.moments.map((m, i) => (
              <MomentRow key={`${m.gameId}:${m.ply}`} m={m} known={turns.get(m.ply)} index={i} />
            ))}
          </ol>
        )}
        <Button size="lg" onClick={() => navigate(playPath(game.opening, game.level))}>
          Next game
        </Button>
      </div>
      {unlocked && <LevelUp depth={unlocked} onClose={closeLevelUp} />}
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
