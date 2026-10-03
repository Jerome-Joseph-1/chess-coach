import type { RateCount } from '../../progress/stats';

/** One quiet line: how the last seven days went. */
export function WeekLine({ total }: { total: RateCount }) {
  return (
    <p class="week-line">
      {total.total === 0 ? 'Play a game to see your progress here.' : `${total.right} of ${total.total} key positions right this week`}
    </p>
  );
}
