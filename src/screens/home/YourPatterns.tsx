import type { OpeningId } from '../../content/types';
import type { PatternStat } from '../../progress/stats';
import { LevelBar, LevelWord, PatternTile, useRolledCount } from '../shared/PatternParts';
import { PATTERNS, usePatternStats, type PatternId } from '../shared/patterns';

const SHOWN = 3;

function PatternRow({ stat, index }: { stat: PatternStat<PatternId>; index: number }) {
  const right = useRolledCount(stat.count, index);
  return (
    <li class="row pattern-row">
      <PatternTile pattern={stat.pattern} />
      <span class="row-main">
        <span class="row-title">{PATTERNS[stat.pattern].name}</span>
        <LevelWord level={stat.level} />
      </span>
      <span class="pattern-score">
        <span class="score">
          {right} of {stat.count.total}
        </span>
        <LevelBar count={stat.count} level={stat.level} index={index} />
      </span>
    </li>
  );
}

/** The three patterns you have met most in this opening lately, with a word for each. */
export function YourPatterns({ opening }: { opening: OpeningId }) {
  // Quiet positions are counted on Progress; Today shows the tactics.
  const stats = usePatternStats(opening)?.filter((s) => s.pattern !== 'quiet');
  if (!stats?.length) return null;
  return (
    <section class="section-block" aria-labelledby="patterns-title">
      <div class="section-head">
        <h2 id="patterns-title" class="section-label">
          Your patterns
        </h2>
        <a class="section-link" href="#/progress">
          See all
        </a>
      </div>
      <ul class="card list">
        {stats.slice(0, SHOWN).map((stat, i) => (
          <PatternRow key={stat.pattern} stat={stat} index={i} />
        ))}
      </ul>
    </section>
  );
}
