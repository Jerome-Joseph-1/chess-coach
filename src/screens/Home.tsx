import { useState } from 'preact/hooks';
import { OPENINGS } from '../content/catalog';
import type { Level, OpeningId } from '../content/types';
import { dueReviews, getDepth, getLastGame, getSettings, getWeekStats, saveSettings, welcomeBack } from '../progress/store';
import { InstallHint } from '../ui/InstallHint';
import { TabBar } from '../ui/TabBar';
import { OpeningCard } from './home/OpeningCard';
import { OpeningList } from './home/OpeningList';
import { ReviewsRow } from './home/ReviewsRow';
import { useNextGame } from './home/useNextGame';
import { WeekCard } from './home/WeekCard';
import './shared/screen.css';
import './home.css';

/** The opening you played last, or the first one. */
function initialOpening(): OpeningId {
  return getLastGame()?.opening ?? OPENINGS[0].id;
}

export function Home() {
  const [settings, setSettings] = useState(getSettings);
  const [featured, setFeatured] = useState(initialOpening);
  const level = settings.levels[featured];
  const game = useNextGame(featured, level);
  const now = Date.now();
  const due = OPENINGS.flatMap((o) => dueReviews(o.id, settings.levels[o.id], now));

  const chooseLevel = (opening: OpeningId, next: Level) => {
    saveSettings({ ...settings, levels: { ...settings.levels, [opening]: next } });
    setSettings(getSettings());
  };
  const choose = (opening: OpeningId) => {
    setFeatured(opening);
    scrollTo({ top: 0, behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
  };

  return (
    <main class="screen screen--tabs today">
      <header class="topbar">
        <h1 class="wordmark">
          Chess Coach<span class="wordmark-dot">.</span>
        </h1>
      </header>
      <InstallHint />
      {welcomeBack(now) && (
        <p class="welcome welcome--card">
          <span class="due-dot" aria-hidden="true" />
          Welcome back: your next game counts double
        </p>
      )}
      <div class="stack">
        <OpeningCard opening={featured} level={level} stage={getDepth(featured, level)} quick={settings.quick} game={game} />
        <ReviewsRow due={due} />
        <WeekCard stats={getWeekStats(now)} />
        <OpeningList levels={settings.levels} featured={featured} onSelect={choose} onLevel={chooseLevel} />
      </div>
      <TabBar current="today" />
    </main>
  );
}
