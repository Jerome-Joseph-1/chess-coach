import type { Depth } from '../../content/types';
import { DEPTHS, stageLine } from '../../progress/depth';
import './screen.css';

export function StageDots({ depth }: { depth: Depth }) {
  return (
    <span class="stage-dots" aria-hidden="true">
      {DEPTHS.map((n) => (
        <i key={n} class={n <= depth ? 'on' : ''} />
      ))}
    </span>
  );
}

/** Five dots and "Stage 3 of 5: Play the move". */
export function StageLine({ depth }: { depth: Depth }) {
  return (
    <p class="stage-line">
      <StageDots depth={depth} />
      <span>{stageLine(depth)}</span>
    </p>
  );
}
