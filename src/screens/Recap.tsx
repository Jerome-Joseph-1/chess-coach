import pieceSprite from 'cm-chessboard/assets/pieces/standard.svg?no-inline';
import { useEffect, useState } from 'preact/hooks';
import { lessonFor } from '../learn';
import type { GameSummary, MomentResult, Turn } from '../content/types';
import { isRight } from '../progress/moments';
import { clearLastGameUnlock, getLastGame, getLastGameBonus, getLastGameUnlock } from '../progress/store';
import { navigate } from '../router';
import { Button } from '../ui/Button';
import { LevelUp } from '../ui/LevelUp';
import { prefersReducedMotion } from '../ui/motion';
import { celebrate } from '../ui/rewards';
import { playSound } from '../ui/sound';
import { coachNote, handledWell, momentSub, momentTitle, momentTone, type MomentTone } from './recap/moments';
import { dockDelay, pipDelay, rowDelay, scoreDuration, PIP_START_MS } from './recap/timeline';
import { Icon, type IconName } from './shared/icons';
import { OPENING_TITLES, playPath, ratingLine, reviewPath } from './shared/labels';
import { loadGameOnce } from './shared/patterns';
import { useCountUp } from './shared/useCountUp';
import './shared/screen.css';
import './recap.css';

// Let the score land before the confetti.
const CELEBRATE_AFTER_MS = 300;

// Coming back to the recap later in the same session must not celebrate or chime for the same game twice.
let celebratedGameAt: number | null = null;
let soundedGameAt: number | null = null;

const MARKS: Record<MomentTone, IconName> = { right: 'check', quiet: 'check', missed: 'cross' };

interface KnownTurn {
  turn: Turn;
  pattern: string;
}

function MomentRow({ m, known, index }: { m: MomentResult; known?: KnownTurn; index: number }) {
  const tone = momentTone(m);
  const contents = (
    <>
      <span class={`tile ${tone === 'missed' ? 'tile--missed' : 'tile--right'}`} aria-hidden="true">
        <Icon name={MARKS[tone]} />
      </span>
      <span class="row-main">
        <span class="moment-title">{momentTitle(m, known?.turn, known?.pattern)}</span>
        <span class="row-sub">{momentSub(m)}</span>
      </span>
      {tone === 'missed' && <span class="moment-again">See it again</span>}
    </>
  );
  return (
    <li class="rise-in" style={{ animationDelay: `${rowDelay(index)}ms` }}>
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
    loadGameOnce(game.opening, game.level, game.gameId)
      .then((data) => current && setTurns(new Map(data.turns.map((turn, i) => [turn.ply, { turn, pattern: lessonFor(data, i).name }]))))
      .catch(() => {});
    return () => {
      current = false;
    };
  }, [game.opening, game.level, game.gameId, game.moments.length]);
  return turns;
}

/** A soft tick as each pip fills, then the closing chord; a new stage brings its own chord instead. */
function useResultSounds(game: GameSummary, levelUp: boolean): void {
  useEffect(() => {
    if (soundedGameAt === game.at || levelUp) return;
    soundedGameAt = game.at;
    const pips = game.moments.length;
    const ticks = prefersReducedMotion() ? [] : game.moments.map((_, i) => setTimeout(() => playSound('piece'), pipDelay(i)));
    const end = setTimeout(() => playSound('end'), pipDelay(pips));
    return () => [...ticks, end].forEach(clearTimeout);
  }, [game.at]);
}

function usePerfectCelebration(game: GameSummary, perfect: boolean): void {
  useEffect(() => {
    if (!perfect || celebratedGameAt === game.at) return;
    celebratedGameAt = game.at;
    const id = setTimeout(() => celebrate('perfect'), pipDelay(game.moments.length) + CELEBRATE_AFTER_MS);
    return () => clearTimeout(id);
  }, [game.at, perfect]);
}

function Pips({ moments }: { moments: MomentResult[] }) {
  return (
    <span class="pips" aria-hidden="true">
      {moments.map((m, i) => (
        <i key={`${m.gameId}:${m.ply}`} class={`pip ${isRight(m) ? 'pip--right' : 'pip--missed'}`} style={{ '--delay': `${pipDelay(i)}ms` }}>
          <Icon name={isRight(m) ? 'check' : 'cross'} size={14} />
        </i>
      ))}
    </span>
  );
}

function Summary({ moments, bonus }: { moments: MomentResult[]; bonus: boolean }) {
  const { right, total } = handledWell(moments);
  const shown = useCountUp(right, scoreDuration(total), PIP_START_MS);
  if (total === 0) {
    return <p class="card recap-quiet muted">No key positions came up in this game.</p>;
  }
  return (
    <section class="summary rise-in" aria-label="Result">
      <p class="summary-number">
        {shown}
        <span class="summary-of"> of {total}</span>
      </p>
      <p class="summary-label">key positions handled well</p>
      <Pips moments={moments} />
      {bonus && (
        <p class="welcome">
          <span class="due-dot" aria-hidden="true" />
          Welcome back: this game counts double
        </p>
      )}
    </section>
  );
}

function CoachNote({ moments }: { moments: MomentResult[] }) {
  const note = coachNote(moments);
  if (!note) return null;
  return (
    <div class="coach-note rise-in" style={{ animationDelay: `${rowDelay(-1)}ms` }}>
      <span class="coach-mark" aria-hidden="true">
        <svg viewBox="0 0 40 40">
          <use href={`${pieceSprite}#bn`} />
        </svg>
      </span>
      <div class="coach-bubble">
        <p class="eyebrow">Coach's note</p>
        <p>{note}</p>
      </div>
    </div>
  );
}

function RecapBody({ game, bonus }: { game: GameSummary; bonus: boolean }) {
  const turns = useTurns(game);
  const [unlocked, setUnlocked] = useState(getLastGameUnlock);
  const perfect = game.moments.some((m) => m.type !== 'nothing') && game.moments.every(isRight);
  useResultSounds(game, unlocked !== null);
  usePerfectCelebration(game, perfect && !unlocked);

  const closeLevelUp = () => {
    clearLastGameUnlock();
    setUnlocked(null);
  };

  return (
    <main class="screen recap">
      <header class="nav-bar">
        <a class="nav-button" href="#/" aria-label="Close">
          <Icon name="cross" size={24} />
        </a>
        <div class="nav-title">
          <h1>Game complete</h1>
          <p>
            {OPENING_TITLES[game.opening]} · {ratingLine(game.level)}
          </p>
        </div>
      </header>

      <div class="stack">
        <Summary moments={game.moments} bonus={bonus} />
        <CoachNote moments={game.moments} />
        {game.moments.length > 0 && (
          <section class="section-block" aria-labelledby="key-positions-title">
            <h2 id="key-positions-title" class="section-label rise-in" style={{ animationDelay: `${rowDelay(-1)}ms` }}>
              Key positions
            </h2>
            <ol class="card list" aria-label="Key positions">
              {game.moments.map((m, i) => (
                <MomentRow key={`${m.gameId}:${m.ply}`} m={m} known={turns.get(m.ply)} index={i} />
              ))}
            </ol>
          </section>
        )}
      </div>

      <div class="dock rise-in" style={{ animationDelay: `${dockDelay(game.moments.length, game.moments.length)}ms` }}>
        <a class="btn btn-secondary btn-lg dock-today" href="#/">
          <Icon name="home" />
          Today
        </a>
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
