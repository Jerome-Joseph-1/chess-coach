import type { RefObject } from 'preact';
import { COPY } from '../copy';

export interface SpotChoicesProps {
  /** The right answer is "Yes". */
  expectYes: boolean;
  /** The user's latest answer. */
  picked: boolean | null;
  /** The right answer is in: the row is done, otherwise a wrong one can be picked over. */
  settled: boolean;
  onAnswer: (yes: boolean) => void;
  innerRef?: RefObject<HTMLDivElement>;
}

type ChoiceState = 'idle' | 'right' | 'wrong' | 'dim';

function stateOf(isYes: boolean, { expectYes, picked, settled }: SpotChoicesProps): ChoiceState {
  if (picked === null || (!settled && picked !== isYes)) return 'idle';
  if (picked !== isYes) return 'dim';
  return isYes === expectYes ? 'right' : 'wrong';
}

const GLYPHS: Record<ChoiceState, string | null> = {
  idle: null,
  dim: null,
  right: 'M13.2 6.6L8.1 11.7L5.4 9',
  wrong: 'M12 6L6 12M6 6L12 12',
};

/** A ring that fills and draws its check, or its cross, once the row is answered. */
function ChoiceRing({ state }: { state: ChoiceState }) {
  const glyph = GLYPHS[state];
  return (
    <svg class={`choice-ring is-${state}`} viewBox="0 0 18 18" width="18" height="18" aria-hidden="true">
      <circle cx="9" cy="9" r="8.25" />
      {glyph && <path key={state} d={glyph} pathLength={1} />}
    </svg>
  );
}

function Choice({ isYes, ...props }: SpotChoicesProps & { isYes: boolean }) {
  const state = stateOf(isYes, props);
  return (
    <button
      type="button"
      class={`dock-btn btn btn-secondary is-wide pause-choice is-${state}`}
      aria-disabled={props.settled}
      onClick={() => !props.settled && props.onAnswer(isYes)}
    >
      <ChoiceRing state={state} />
      {isYes ? COPY.spotYes : COPY.spotNo}
    </button>
  );
}

/** Step 1's answers sit in the dock: No and Yes. A wrong one is only an error; the other can still be picked. */
export function SpotChoices(props: SpotChoicesProps) {
  return (
    <div class="pause-choices" role="group" aria-label={COPY.spotTitle} ref={props.innerRef}>
      <Choice isYes={false} {...props} />
      <Choice isYes={true} {...props} />
    </div>
  );
}
