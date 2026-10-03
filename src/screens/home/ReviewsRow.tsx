import type { ReviewItem } from '../../content/types';
import { Chevron } from '../shared/icons';
import { reviewPath } from '../shared/labels';

/** Positions that are due for another look; hidden when nothing is due. */
export function ReviewsRow({ due }: { due: ReviewItem[] }) {
  if (due.length === 0) return null;
  return (
    <a class="card row reviews-row" href={`#${reviewPath(due[0])}`}>
      <span class="due-dot" aria-hidden="true" />
      <span class="row-main">
        Review {due.length} {due.length === 1 ? 'position' : 'positions'} you missed
      </span>
      <Chevron />
    </a>
  );
}
