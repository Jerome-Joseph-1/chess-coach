import type { Depth } from '../../content/types';
import { DEPTH_NAMES, STAGES, stageNumber } from '../../progress/depth';
import type { RateCount } from '../../progress/stats';
import { fillDelay } from '../shared/PatternParts';

interface StageProgressProps {
  depth: Depth;
  /** Right answers towards the next stage; null when the stage is chosen in Settings. */
  progress: RateCount | null;
}

function progressLabel(stage: number, progress: RateCount | null): string {
  if (!progress) return 'Set in Settings';
  if (stage === STAGES.length) return 'Last stage';
  return `${progress.right} of ${progress.total} right`;
}

/** Earlier stages are full, the current one fills towards the next, later ones wait. */
function segmentFill(segment: number, stage: number, progress: RateCount | null): number {
  if (segment < stage - 1) return 1;
  if (segment > stage - 1) return 0;
  if (!progress || stage === STAGES.length) return 1;
  return progress.right / progress.total;
}

/** "Stage 1 of 3 · Spot it, then play it", how far along it is, and three segments. */
export function StageProgress({ depth, progress }: StageProgressProps) {
  const stage = stageNumber(depth);
  return (
    <div class="stage-progress">
      <div class="stage-row">
        <p class="stage-name">
          <strong>
            Stage {stage} of {STAGES.length}
          </strong>{' '}
          · {DEPTH_NAMES[depth]}
        </p>
        <span class="stage-count">{progressLabel(stage, progress)}</span>
      </div>
      <span class="stage-bar" aria-hidden="true">
        {STAGES.map((_, i) => segmentFill(i, stage, progress)).map((fill, i) => (
          <span key={i} class="bar">
            {fill > 0 && <span class="bar-fill" style={{ '--r': fill, '--delay': `${fillDelay(i)}ms` }} />}
          </span>
        ))}
      </span>
    </div>
  );
}
