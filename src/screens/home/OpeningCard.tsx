import type { Depth, Level, OpeningId } from '../../content/types';
import { stageLine } from '../../progress/depth';
import { navigate } from '../../router';
import { Button } from '../../ui/Button';
import { disabledIf } from '../shared/disabledIf';
import { OPENING_TITLES, playPath, ratingLine, sideLine } from '../shared/labels';
import type { SetStatus } from './useSetStatus';

interface OpeningCardProps {
  opening: OpeningId;
  level: Level;
  stage: Depth;
  status: SetStatus;
}

/** The opening you would play next: who you play, how far along you are, and the one button to start. */
export function OpeningCard({ opening, level, stage, status }: OpeningCardProps) {
  return (
    <section class="card opening-card" aria-labelledby="opening-card-title">
      <div>
        <h2 id="opening-card-title" class="opening-title">
          {OPENING_TITLES[opening]}
        </h2>
        <p class="opening-line">
          {sideLine(opening)} · {ratingLine(level)}
        </p>
        <p class="muted">{stageLine(stage)}</p>
      </div>
      {status === 'error' && <p class="muted">Can't reach the games right now. Check your connection.</p>}
      <Button size="lg" {...disabledIf(status !== 'ready')} onClick={() => navigate(playPath(opening, level))}>
        {status === 'soon' ? 'Coming soon' : 'Play'}
      </Button>
    </section>
  );
}
