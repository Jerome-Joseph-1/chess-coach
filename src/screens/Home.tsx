import { useState } from 'preact/hooks';
import { OPENINGS } from '../content/catalog';
import type { OpeningId } from '../content/types';
import { dueReviews, getDepth, getLastGame, getSettings, getWeekStats, welcomeBack } from '../progress/store';
import { InstallHint } from '../ui/InstallHint';
import { TabBar } from '../ui/TabBar';
import { OpeningCard } from './home/OpeningCard';
import { ReviewsRow } from './home/ReviewsRow';
import { useSetStatus } from './home/useSetStatus';
import { WeekLine } from './home/WeekLine';
import { Segmented } from './shared/Segmented';
import './shared/screen.css';
import './home.css';

const OPENING_OPTIONS = OPENINGS.map((o) => ({ value: o.id, label: o.name }));

/** The opening you played last, or the first one. */
function initialOpening(): OpeningId {
  return getLastGame()?.opening ?? OPENINGS[0].id;
}

export function Home() {
  const [featured, setFeatured] = useState(initialOpening);
  const { levels } = getSettings();
  const level = levels[featured];
  const status = useSetStatus(featured, level);
  const now = Date.now();
  const due = OPENINGS.flatMap((o) => dueReviews(o.id, levels[o.id], now));

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
        <OpeningCard opening={featured} level={level} stage={getDepth(featured, level)} status={status} />
        <Segmented label="Opening" options={OPENING_OPTIONS} value={featured} onChange={setFeatured} />
        <ReviewsRow due={due} />
        <WeekLine total={getWeekStats(now).total} />
      </div>
      <TabBar current="today" />
    </main>
  );
}
