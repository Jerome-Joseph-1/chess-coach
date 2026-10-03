import { stepLabel } from '../copy';

export interface StepHeaderProps {
  step: number;
  total: number;
}

/** "Step 1 of 3" with one dot per step: filled for the steps done and the one in hand. */
export function StepHeader({ step, total }: StepHeaderProps) {
  return (
    <div class="pause-head">
      <span class="pause-count">{stepLabel(step, total)}</span>
      <span class="pause-dots" aria-hidden="true">
        {Array.from({ length: total }, (_, i) => (
          <i key={i} class={i < step ? 'is-on' : undefined} />
        ))}
      </span>
    </div>
  );
}
