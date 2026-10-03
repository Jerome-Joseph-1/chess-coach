import type { OpeningId } from '../content/types';
import { dayKey, lastWeeks } from '../progress/days';
import { STAGES, stageNumber } from '../progress/depth';
import { weekStats, type PatternStat, type RateCount } from '../progress/stats';
import { getActiveDays, getDepth, getMoments, getSetStats, getSettings, getStageProgress, hasPlayed } from '../progress/store';
import { navigate } from '../router';
import { Button } from '../ui/Button';
import { TabBar } from '../ui/TabBar';
import { EmptyCard } from './shared/EmptyCard';
import { OPENING_SHORT } from './shared/labels';
import { OpeningSwitch, useOpening } from './shared/OpeningSwitch';
import { LevelBar, LevelWord, PatternTile, useRolledCount } from './shared/PatternParts';
import { PATTERNS, usePatternStats, type PatternId } from './shared/patterns';
import './shared/screen.css';
import './progress.css';

const WEEKS = 8;

function StatTile({ eyebrow, value, caption }: { eyebrow: string; value: string; caption: string }) {
  return (
    <div class="card stat-tile">
      <p class="eyebrow">{eyebrow}</p>
      <p class="stat-value">{value}</p>
      <p class="stat-caption">{caption}</p>
    </div>
  );
}

function stageTile(opening: OpeningId): { eyebrow: string; value: string; caption: string } {
  const { levels } = getSettings();
  const stage = stageNumber(getDepth(opening, levels[opening]));
  const progress = getStageProgress(opening, levels[opening]);
  const eyebrow = `Stage ${stage} of ${STAGES.length}`;
  if (!progress) return { eyebrow, value: `${stage} / ${STAGES.length}`, caption: 'stage chosen in Settings' };
  if (stage === STAGES.length) return { eyebrow, value: `${stage} / ${STAGES.length}`, caption: 'the last stage' };
  return { eyebrow, value: `${progress.right} / ${progress.total}`, caption: 'right to move up' };
}

function Stats({ opening }: { opening: OpeningId }) {
  const week: RateCount = weekStats(
    getMoments().filter((m) => m.opening === opening),
    Date.now(),
  ).total;
  return (
    <div class="stat-tiles">
      <StatTile eyebrow="This week" value={`${week.right} / ${week.total}`} caption="positions handled well" />
      <StatTile {...stageTile(opening)} />
    </div>
  );
}

function PatternCard({ stat, index }: { stat: PatternStat<PatternId>; index: number }) {
  const right = useRolledCount(stat.count, index);
  const verb = stat.pattern === 'quiet' ? 'right' : 'found';
  return (
    <li class="card pattern-card">
      <div class="pattern-card-top">
        <PatternTile pattern={stat.pattern} small />
        <LevelWord level={stat.level} />
      </div>
      <p class="pattern-card-name">{PATTERNS[stat.pattern].name}</p>
      <p class="pattern-card-count">
        {right} of {stat.count.total} {verb}
      </p>
      <LevelBar count={stat.count} level={stat.level} index={index} />
    </li>
  );
}

function Patterns({ opening }: { opening: OpeningId }) {
  const stats = usePatternStats(opening);
  return (
    <section class="section-block" aria-labelledby="patterns-title">
      <div class="section-head">
        <h2 id="patterns-title" class="section-label">
          Patterns
        </h2>
        <span class="section-note">Last 30 days</span>
      </div>
      {stats?.length === 0 && <EmptyCard text="No key positions in the last 30 days." />}
      {stats && stats.length > 0 && (
        <ul class="pattern-grid">
          {stats.map((stat, i) => (
            <PatternCard key={stat.pattern} stat={stat} index={i} />
          ))}
        </ul>
      )}
    </section>
  );
}

function OpeningProgress({ opening }: { opening: OpeningId }) {
  const started = getSetStats(opening, getSettings().levels[opening]).games > 0;
  if (!started) {
    return (
      <EmptyCard
        label={OPENING_SHORT[opening]}
        title="Not started yet"
        text={`Play the ${OPENING_SHORT[opening]} and your stage and patterns show up here.`}
      />
    );
  }
  return (
    <>
      <Stats opening={opening} />
      <Patterns opening={opening} />
    </>
  );
}

function Activity() {
  const now = Date.now();
  const played = getActiveDays();
  const today = dayKey(now);
  return (
    <section class="section-block" aria-labelledby="activity-title">
      <div class="section-head">
        <h2 id="activity-title" class="section-label">
          Days played
        </h2>
        <span class="section-note">Last {WEEKS} weeks</span>
      </div>
      <div class="card activity">
        <div class="activity-grid" role="img" aria-label={`Days you played in the last ${WEEKS} weeks`}>
          {lastWeeks(now, WEEKS)
            .flat()
            .map((day) => (
              <i key={day} class={`day ${played.has(day) ? 'day--on' : ''} ${day > today ? 'day--future' : ''} ${day === today ? 'day--today' : ''}`} />
            ))}
        </div>
        <p class="muted">Each filled square is a day you played.</p>
      </div>
    </section>
  );
}

function EmptyProgress() {
  return (
    <EmptyCard title="Your progress shows up here" text="Play a game and this page fills in: your stage and the patterns you find.">
      <Button onClick={() => navigate('/')}>Play a game</Button>
    </EmptyCard>
  );
}

export function Progress() {
  const [opening, setOpening] = useOpening();
  return (
    <main class="screen screen--tabs">
      <header class="large-head">
        <h1 class="large-title">Progress</h1>
        <p class="large-sub">Your stage, patterns and days played.</p>
      </header>
      <div class="stack">
        <OpeningSwitch value={opening} onChange={setOpening} />
        {hasPlayed() ? (
          <>
            <OpeningProgress key={opening} opening={opening} />
            <Activity />
          </>
        ) : (
          <EmptyProgress />
        )}
      </div>
      <TabBar current="progress" />
    </main>
  );
}
