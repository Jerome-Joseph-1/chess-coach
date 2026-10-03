import type { Depth } from '../../content/types';
import { STAGES, stageLine, stageNumber } from '../../progress/depth';
import './screen.css';

export function StageDots({ depth }: { depth: Depth }) {
  return (
    <span class="stage-dots" aria-hidden="true">
      {STAGES.map((stage, i) => (
        <i key={stage} class={i < stageNumber(depth) ? 'on' : ''} />
      ))}
    </span>
  );
}

/** Three dots and "Stage 2 of 3: Play the follow-up too". */
export function StageLine({ depth }: { depth: Depth }) {
  return (
    <p class="stage-line">
      <StageDots depth={depth} />
      <span>{stageLine(depth)}</span>
    </p>
  );
}
