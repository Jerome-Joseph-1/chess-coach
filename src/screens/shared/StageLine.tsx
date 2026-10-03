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

/** "Stage 3 of 5: Play" and five dots. */
export function StageLine({ depth }: { depth: Depth }) {
  return (
    <p class="stage-line">
      <span>{stageLine(depth)}</span>
      <StageDots depth={depth} />
    </p>
  );
}
