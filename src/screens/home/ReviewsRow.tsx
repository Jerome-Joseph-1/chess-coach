import { useState } from 'preact/hooks';
import type { ReviewItem } from '../../content/types';
import { Icon } from '../shared/icons';
import { plural, reviewPath } from '../shared/labels';
import { firstTimeToday } from './firstToday';

// About a minute per position: look, answer, read the lesson.
const MINUTES_EACH = 1;

/** Positions that are due for another look; hidden when nothing is due. */
export function ReviewsRow({ due }: { due: ReviewItem[] }) {
  if (due.length === 0) return null;
  return <DueRow due={due} />;
}

function DueRow({ due }: { due: ReviewItem[] }) {
  const [glow] = useState(() => firstTimeToday('reviewsGlow', Date.now()));
  const games = new Set(due.map((r) => r.gameId)).size;
  return (
    <a class={`card row reviews-row ${glow ? 'reviews-row--glow' : ''}`} href={`#${reviewPath(due[0])}`}>
      <span class="tile" aria-hidden="true">
        <Icon name="replay" />
      </span>
      <span class="row-main">
        <span class="row-title">Review {plural(due.length, 'position')} you missed</span>
        <span class="row-sub">
          About {plural(due.length * MINUTES_EACH, 'minute')} · from {plural(games, 'game')}
        </span>
      </span>
      <Icon name="chevron" class="chevron" />
    </a>
  );
}
