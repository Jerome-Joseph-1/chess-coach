import { openingById } from '../../content/catalog';
import type { Level, OpeningId } from '../../content/types';
import { getDepth, getSetStats, getStageProgress } from '../../progress/store';
import { navigate } from '../../router';
import { Button } from '../../ui/Button';
import { disabledIf } from '../shared/disabledIf';
import { Icon } from '../shared/icons';
import { OPENING_TITLES, playPath, sideLine } from '../shared/labels';
import { MiniBoard } from './MiniBoard';
import { StageProgress } from './StageProgress';
import type { SetStatus } from './useSetStatus';

interface UpNextCardProps {
  opening: OpeningId;
  level: Level;
  status: SetStatus;
}

/** The one next step: which game comes up, how far along the stage is, and Play. */
export function UpNextCard({ opening, level, status }: UpNextCardProps) {
  const { start, side } = openingById(opening);
  const gameNumber = getSetStats(opening, level).games + 1;
  return (
    <section class="card up-next" aria-labelledby="up-next-title">
      <div class="up-next-top">
        <MiniBoard moves={start} side={side} />
        <div class="up-next-text">
          <p class="eyebrow up-next-eyebrow">Up next · Game {gameNumber}</p>
          <h2 id="up-next-title" class="up-next-title">
            {OPENING_TITLES[opening]}
          </h2>
          <p class="up-next-line">
            {sideLine(opening)} · opponents {level}
          </p>
        </div>
      </div>
      <StageProgress depth={getDepth(opening, level)} progress={getStageProgress(opening, level)} />
      {status === 'error' && <p class="up-next-line">Can't reach the games right now. Check your connection.</p>}
      <Button size="lg" class="btn-with-icon" {...disabledIf(status !== 'ready')} onClick={() => navigate(playPath(opening, level))}>
        {status !== 'soon' && <Icon name="play" />}
        {status === 'soon' ? 'Coming soon' : 'Play'}
      </Button>
    </section>
  );
}
