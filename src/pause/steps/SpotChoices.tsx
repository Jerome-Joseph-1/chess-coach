import type { RefObject } from 'preact';
import { SITUATIONS, type Situation } from '../../learn/situation';
import { COPY } from '../copy';

export interface SpotChoicesProps {
  /** The picks that count as right. */
  answers: Situation[];
  /** The user's latest pick. */
  picked: Situation | null;
  /** A right pick is in: the grid is done, otherwise a wrong one can be picked over. */
  settled: boolean;
  onAnswer: (pick: Situation) => void;
  innerRef?: RefObject<HTMLDivElement>;
}

type ChoiceState = 'idle' | 'right' | 'wrong' | 'dim';

function stateOf(id: Situation, { answers, picked, settled }: SpotChoicesProps): ChoiceState {
  if (picked === null || (!settled && picked !== id)) return 'idle';
  if (picked !== id) return 'dim';
  return answers.includes(id) ? 'right' : 'wrong';
}

const GLYPHS = {
  right: 'M13.2 6.6L8.1 11.7L5.4 9',
  wrong: 'M12 6L6 12M6 6L12 12',
};

/** The picked answer's disc, which pops in and draws its check or its cross. */
function ChoiceMark({ state }: { state: keyof typeof GLYPHS }) {
  return (
    <svg class={`choice-ring is-${state}`} viewBox="0 0 18 18" width="16" height="16" aria-hidden="true">
      <circle cx="9" cy="9" r="9" />
      <path key={state} d={GLYPHS[state]} pathLength={1} />
    </svg>
  );
}

function Choice({ id, label, ...props }: SpotChoicesProps & { id: Situation; label: string }) {
  const state = stateOf(id, props);
  return (
    <button
      type="button"
      class={`dock-btn btn btn-secondary pause-choice is-${state}`}
      aria-disabled={props.settled}
      onClick={() => !props.settled && props.onAnswer(id)}
    >
      {(state === 'right' || state === 'wrong') && <ChoiceMark state={state} />}
      {label}
    </button>
  );
}

/**
 * Step 1's five answers under the question: two rows of two, then "Nothing urgent" across. Only the picked one
 * carries a mark, so every label fits on one line on the narrowest phones. A wrong pick is only an error.
 */
export function SpotChoices(props: SpotChoicesProps) {
  return (
    <div class="spot-choices rise-in" role="group" aria-label={COPY.spotTitle} ref={props.innerRef}>
      {SITUATIONS.map(({ id, label }) => (
        <Choice key={id} id={id} label={label} {...props} />
      ))}
    </div>
  );
}
