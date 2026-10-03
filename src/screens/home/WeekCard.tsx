import type { WeekStats } from '../../progress/stats';
import { RollingNumber } from '../shared/RollingNumber';
import { legendItems } from './legend';

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
  const items = legendItems(stats);
  return (
    <section class="card week-card" aria-label="This week">
      <p class="week-number">
        <RollingNumber value={stats.total.right} />
        <span class="week-of"> of </span>
        <RollingNumber value={stats.total.total} />
      </p>
      <p class="muted">key positions handled well this week</p>
      <div class="week-bar" aria-hidden="true">
        {items.map(({ kind, right, total }) => (
          <span key={kind} class={`week-seg part--${kind}`} style={{ flexGrow: total, '--r': right / total }}>
            <i />
          </span>
        ))}
      </div>
      <ul class="legend">
        {items.map(({ kind, text }) => (
          <li key={kind} class={`part--${kind}`}>
            <i class="swatch" />
            {text}
          </li>
        ))}
      </ul>
    </section>
  );
}
