import { useEffect, useState } from 'preact/hooks';
import { OPENINGS } from '../content/catalog';
import type { Level, OpeningId } from '../content/types';
import { dueReviews, getDepth, getLastGame, getSettings, getWeekStats, saveSettings, welcomeBack } from '../progress/store';
import { useRoute } from '../router';
import { InstallHint } from '../ui/InstallHint';
import { TabBar } from '../ui/TabBar';
import { OpeningCard } from './home/OpeningCard';
import { OpeningList } from './home/OpeningList';
import { ReviewsRow } from './home/ReviewsRow';
import { useNextGame } from './home/useNextGame';
import { WeekCard } from './home/WeekCard';
import { Gear } from './shared/icons';
import './shared/screen.css';
import './home.css';

function scrollBehavior(): ScrollBehavior {
  return matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth';
}

/** The opening you played last, or the first one. */
function initialOpening(): OpeningId {
  return getLastGame()?.opening ?? OPENINGS[0].id;
}

// "Today" and "Openings" are one page: the Openings tab scrolls to the list.
function useOpeningsTab(): boolean {
  const onOpenings = useRoute() === '/openings';
  useEffect(() => {
    if (onOpenings) document.getElementById('openings')?.scrollIntoView({ behavior: scrollBehavior() });
    else scrollTo({ top: 0, behavior: scrollBehavior() });
  }, [onOpenings]);
  return onOpenings;
}

export function Home() {
  const onOpeningsTab = useOpeningsTab();
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
    scrollTo({ top: 0, behavior: scrollBehavior() });
  };

  return (
    <main class="screen screen--tabs">
      <header class="topbar">
        <h1 class="wordmark">
          Chess Coach<span class="wordmark-dot">.</span>
        </h1>
        <a class="round-button" href="#/settings" aria-label="Settings">
          <Gear />
        </a>
      </header>
      <InstallHint />
      {welcomeBack(now) && <p class="welcome">Welcome back. Your first game today counts double.</p>}
      <div class="stack">
        <OpeningCard opening={featured} level={level} stage={getDepth(featured, level)} quick={settings.quick} game={game} />
        <ReviewsRow due={due} />
        <WeekCard stats={getWeekStats(now)} />
        <OpeningList levels={settings.levels} featured={featured} onSelect={choose} onLevel={chooseLevel} />
      </div>
      <TabBar current={onOpeningsTab ? 'openings' : 'today'} />
    </main>
  );
}
