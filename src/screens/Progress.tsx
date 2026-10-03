import { useState } from 'preact/hooks';
import { LEVELS, OPENINGS, type Opening } from '../content/catalog';
import type { Level } from '../content/types';
import { dayKey, lastWeeks } from '../progress/days';
import { DEPTHS, DEPTH_NAMES } from '../progress/depth';
import { STAT_KINDS, percent, type RateCount } from '../progress/stats';
import { dueReviews, getActiveDays, getDepth, getSetStats, getSettings, hasPlayed } from '../progress/store';
import { navigate } from '../router';
import { Button } from '../ui/Button';
import { TabBar } from '../ui/TabBar';
import { STAT_LABELS } from './shared/labels';
import { Segmented } from './shared/Segmented';
import './shared/screen.css';
import './progress.css';

const WEEKS = 8;
const LEVEL_OPTIONS = LEVELS.map((value) => ({ value, label: String(value) }));

function RateBar({ label, count }: { label: string; count: RateCount }) {
  const rate = percent(count);
  return (
    <div class="rate">
      <div class="rate-head">
        <span>{label}</span>
        <span class="muted">{rate === null ? 'No data yet' : `${count.right} of ${count.total}`}</span>
      </div>
      <div class="progress-track" role="img" aria-label={rate === null ? `${label}: no data yet` : `${label}: ${rate}% found`}>
        <div class="bar-fill" style={{ width: `${rate ?? 0}%` }} />
      </div>
    </div>
  );
}

function StepPips({ depth }: { depth: number }) {
  return (
    <span class="pips" role="img" aria-label={`Step ${depth} of ${DEPTHS.length}`}>
      {DEPTHS.map((n) => (
        <i key={n} class={n <= depth ? 'pip pip--on' : 'pip'} />
      ))}
    </span>
  );
}

function SetProgress({ opening, initialLevel }: { opening: Opening; initialLevel: Level }) {
  const [level, setLevel] = useState(initialLevel);
  const stats = getSetStats(opening.id, level);
  const depth = getDepth(opening.id, level);
  const due = dueReviews(opening.id, level, Date.now()).length;
  return (
    <section class="card set-progress" aria-labelledby={`${opening.id}-progress`}>
      <h2 id={`${opening.id}-progress`}>{opening.name}</h2>
      <Segmented label={`${opening.name} level`} options={LEVEL_OPTIONS} value={level} onChange={setLevel} />
      <dl class="facts">
        <div>
          <dt>Games played</dt>
          <dd>{stats.games}</dd>
        </div>
        <div>
          <dt>Reviews due</dt>
          <dd>{due}</dd>
        </div>
      </dl>
      <div class="depth-row" key={`${level}-${depth}`}>
        <span class="chip">
          Step {depth} · {DEPTH_NAMES[depth]}
        </span>
        <StepPips depth={depth} />
      </div>
      <div class="rates">
        <h3>What you found</h3>
        {STAT_KINDS.map((kind) => (
          <RateBar key={`${level}-${kind}`} label={STAT_LABELS[kind]} count={stats.byKind[kind]} />
        ))}
      </div>
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
      <p class="muted activity-note">Each square is a day you played.</p>
    </section>
  );
}

function EmptyProgress() {
  return (
    <section class="card progress-empty">
      <svg width="132" height="104" viewBox="0 0 132 104" aria-hidden="true">
        {[22, 34, 46, 58, 70].map((height, i) => (
          <rect key={height} x={6 + i * 25} y={96 - height} width="20" height={height} rx="6" fill={i === 0 ? 'var(--accent)' : 'var(--surface-2)'} />
        ))}
        <path d="m16 52 3.2 6.6 7.2 1-5.2 5.1 1.2 7.2L16 68.5l-6.4 3.4 1.2-7.2-5.2-5.1 7.2-1z" fill="var(--star)" />
      </svg>
      <h2>Your progress grows here</h2>
      <p class="muted">Play a game and this page fills in: what you find, how deep you can go and what is ready to review.</p>
      <Button onClick={() => navigate('/')}>Play a game</Button>
    </section>
  );
}

export function Progress() {
  const { levels } = getSettings();
  return (
    <main class="screen screen--tabs">
      <h1 class="screen-title">Progress</h1>
      {hasPlayed() ? (
        <div class="stack">
          {OPENINGS.map((opening) => (
            <SetProgress key={opening.id} opening={opening} initialLevel={levels[opening.id]} />
          ))}
          <Activity />
        </div>
      ) : (
        <EmptyProgress />
      )}
      <TabBar current="progress" />
    </main>
  );
}
