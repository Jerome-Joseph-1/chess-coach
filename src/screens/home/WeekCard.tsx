import { STAT_KINDS, type StatKind, type WeekStats } from '../../progress/stats';
import { STAT_LABELS } from '../shared/labels';
import { RollingNumber } from '../shared/RollingNumber';

function Empty() {
  return (
    <section class="card week-card" aria-label="This week">
      <p class="muted">Play a game to see your stats here.</p>
    </section>
  );
}

/** How the last seven days went: one number, one bar split by kind of position, and the numbers behind it. */
export function WeekCard({ stats }: { stats: WeekStats }) {
  if (stats.total.total === 0) return <Empty />;
  const kinds = STAT_KINDS.filter((kind: StatKind) => stats.parts[kind].total > 0);
  return (
    <section class="card week-card" aria-label="This week">
      <p class="week-number">
        <RollingNumber value={stats.total.right} />
        <span class="week-of"> of </span>
        <RollingNumber value={stats.total.total} />
      </p>
      <p class="muted">key positions handled well this week</p>
      <div class="week-bar" aria-hidden="true">
        {kinds.map((kind) => {
          const { right, total } = stats.parts[kind];
          return (
            <span key={kind} class={`week-seg part--${kind}`} style={{ flexGrow: total, '--r': right / total }}>
              <i />
            </span>
          );
        })}
      </div>
      <ul class="legend">
        {kinds.map((kind) => (
          <li key={kind} class={`part--${kind}`}>
            <i class="swatch" />
            {STAT_LABELS[kind]} {stats.parts[kind].right}/{stats.parts[kind].total}
          </li>
        ))}
      </ul>
    </section>
  );
}
