import { OPENINGS } from '../content/catalog';
import type { RateCount } from '../progress/stats';
import { dueReviews, getSettings, getWeekStats, welcomeBack } from '../progress/store';
import { InstallHint } from '../ui/InstallHint';
import { TabBar } from '../ui/TabBar';
import { ReviewsRow } from './home/ReviewsRow';
import { UpNextCard } from './home/UpNextCard';
import { useSetStatus } from './home/useSetStatus';
import { YourPatterns } from './home/YourPatterns';
import { OpeningSwitch, useOpening } from './shared/OpeningSwitch';
import './shared/screen.css';
import './home.css';

function weekLine(week: RateCount): string {
  return week.total === 0 ? 'Play a game to see your progress here.' : `${week.right} of ${week.total} key positions handled well this week`;
}

export function Home() {
  const [opening, setOpening] = useOpening();
  const { levels } = getSettings();
  const level = levels[opening];
  const status = useSetStatus(opening, level);
  const now = Date.now();
  const due = OPENINGS.flatMap((o) => dueReviews(o.id, levels[o.id], now));

  return (
    <main class="screen screen--tabs today">
      <header class="large-head">
        <h1 class="large-title">Today</h1>
        <p class="large-sub">{weekLine(getWeekStats(now).total)}</p>
      </header>
      <InstallHint />
      {welcomeBack(now) && (
        <p class="welcome welcome--card">
          <span class="due-dot" aria-hidden="true" />
          Welcome back: your next game counts double
        </p>
      )}
      <div class="stack">
        <OpeningSwitch value={opening} onChange={setOpening} />
        <UpNextCard opening={opening} level={level} status={status} />
        <ReviewsRow due={due} />
        <YourPatterns opening={opening} />
      </div>
      <TabBar current="today" />
    </main>
  );
}
