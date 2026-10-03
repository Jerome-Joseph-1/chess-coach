import { useState } from 'preact/hooks';
import { LEVELS, OPENINGS, type Opening } from '../content/catalog';
import type { Level } from '../content/types';
import { dayKey, lastWeeks } from '../progress/days';
import { STAT_KINDS, percent, type RateCount } from '../progress/stats';
import { dueReviews, getActiveDays, getDepth, getSetStats, getSettings, hasPlayed } from '../progress/store';
import { navigate } from '../router';
import { Button } from '../ui/Button';
import { TabBar } from '../ui/TabBar';
import { Chevron } from './shared/icons';
import { OPENING_TITLES, STAT_LABELS, ratingLine, sideLine } from './shared/labels';
import { Segmented } from './shared/Segmented';
import { StageLine } from './shared/StageLine';
import './shared/screen.css';
import './progress.css';

const WEEKS = 8;
const LEVEL_OPTIONS = LEVELS.map((value) => ({ value, label: String(value) }));

function RateRow({ label, count }: { label: string; count: RateCount }) {
  const rate = percent(count);
  return (
    <li class="row row-stack rate-row">
      <div class="rate-head">
        <span>{label}</span>
        <span class="muted">{rate === null ? 'Nothing yet' : `${count.right} of ${count.total} · ${rate}%`}</span>
      </div>
      <div class="meter" role="img" aria-label={rate === null ? `${label}: nothing yet` : `${label}: ${rate}% right`}>
        <div class="meter-fill" style={{ '--r': (rate ?? 0) / 100 }} />
      </div>
    </li>
  );
}

function SetProgress({ opening, initialLevel }: { opening: Opening; initialLevel: Level }) {
  const [level, setLevel] = useState(initialLevel);
  const stats = getSetStats(opening.id, level);
  const due = dueReviews(opening.id, level, Date.now()).length;
  const titleId = `${opening.id}-progress`;
  return (
    <section class="card set-progress" aria-labelledby={titleId}>
      <div class="set-head">
        <h2 id={titleId}>{OPENING_TITLES[opening.id]}</h2>
        <p class="muted">
          {sideLine(opening.id)} · {ratingLine(level)}
        </p>
        <Segmented label={`${OPENING_TITLES[opening.id]} level`} options={LEVEL_OPTIONS} value={level} onChange={setLevel} />
      </div>
      <ul class="list">
        <li class="row">
          <span>Games played</span>
          <span class="row-value">{stats.games}</span>
        </li>
        <li class="row">
          <StageLine depth={getDepth(opening.id, level)} />
        </li>
        <li class="row">
          <span>Reviews due</span>
          <span class="row-value">
            {due > 0 && <span class="due-dot" aria-hidden="true" />}
            {due}
          </span>
        </li>
      </ul>
      <h3 class="section-label rates-title">What you got right</h3>
      <ul class="list">
        {STAT_KINDS.map((kind) => (
          <RateRow key={`${level}-${kind}`} label={STAT_LABELS[kind]} count={stats.byKind[kind]} />
        ))}
      </ul>
    </section>
  );
}

function Activity() {
  const now = Date.now();
  const played = getActiveDays();
  const today = dayKey(now);
  return (
    <section class="card activity" aria-labelledby="activity-title">
      <h2 id="activity-title">Last {WEEKS} weeks</h2>
      <div class="activity-grid" role="img" aria-label={`Days you played in the last ${WEEKS} weeks`}>
        {lastWeeks(now, WEEKS)
          .flat()
          .map((day) => (
            <i key={day} class={`day ${played.has(day) ? 'day--on' : ''} ${day > today ? 'day--future' : ''} ${day === today ? 'day--today' : ''}`} />
          ))}
      </div>
      <p class="muted">Each square is a day you played.</p>
    </section>
  );
}

function EmptyProgress() {
  return (
    <section class="card progress-empty">
      <h2>Your progress shows up here</h2>
      <p class="muted">Play a game and this page fills in: what you got right, your stage and what is ready to review.</p>
      <Button onClick={() => navigate('/')}>Play a game</Button>
    </section>
  );
}

export function Progress() {
  const { levels } = getSettings();
  return (
    <main class="screen screen--tabs">
      <h1 class="screen-title">You</h1>
      <div class="stack">
        {hasPlayed() ? (
          <>
            {OPENINGS.map((opening) => (
              <SetProgress key={opening.id} opening={opening} initialLevel={levels[opening.id]} />
            ))}
            <Activity />
          </>
        ) : (
          <EmptyProgress />
        )}
        <a class="card row" href="#/settings">
          <span class="row-main">Settings</span>
          <Chevron />
        </a>
      </div>
      <TabBar current="you" />
    </main>
  );
}
