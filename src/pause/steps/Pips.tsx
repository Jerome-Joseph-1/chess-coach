import type { StepName, StepOutcome } from '../../content/types';

export interface PipsProps {
  planned: StepName[];
  outcomes: StepOutcome[];
}

function pipClass(i: number, outcomes: StepOutcome[]): string {
  if (i < outcomes.length) return outcomes[i].correct ? 'is-good' : 'is-bad';
  return i === outcomes.length ? 'is-now' : '';
}

/** One dot per asked step: done right, done wrong, current, still to come. */
export function Pips({ planned, outcomes }: PipsProps) {
  if (planned.length < 2) return null;
  const now = Math.min(outcomes.length + 1, planned.length);
  return (
    <div class="pause-pips" role="img" aria-label={`Step ${now} of ${planned.length}`}>
      {planned.map((_, i) => (
        <span key={i} class={`pause-pip ${pipClass(i, outcomes)}`} />
      ))}
    </div>
  );
}
