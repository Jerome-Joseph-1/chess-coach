import { CheckPop } from '../../ui/CheckPop';
import { COPY } from '../copy';
import { SubLine } from './SubLine';

export interface SpotStepProps {
  /** What the opponent just did, then how the answer went. */
  sub: string;
  right: boolean;
  /** The right answer is "Yes". */
  expectYes: boolean;
  /** The user's latest answer. */
  picked: boolean | null;
  /** The right answer is in: the row is done, otherwise a wrong one can be picked over. */
  settled: boolean;
  onAnswer: (yes: boolean) => void;
}

type ChoiceState = 'idle' | 'right' | 'wrong' | 'dim';

function stateOf(isYes: boolean, { expectYes, picked, settled }: SpotStepProps): ChoiceState {
  if (picked === null || (!settled && picked !== isYes)) return 'idle';
  if (picked !== isYes) return 'dim';
  return isYes === expectYes ? 'right' : 'wrong';
}

function Choice({ isYes, ...props }: SpotStepProps & { isYes: boolean }) {
  const state = stateOf(isYes, props);
  return (
    <button
      type="button"
      class={`pause-choice is-${state}`}
      aria-disabled={props.settled}
      onClick={() => !props.settled && props.onAnswer(isYes)}
    >
      {state === 'right' || state === 'wrong' ? (
        <CheckPop tone={state === 'right' ? 'success' : 'danger'} />
      ) : (
        <span class="pause-ring" aria-hidden="true" />
      )}
      {isYes ? COPY.spotYes : COPY.spotNo}
    </button>
  );
}

/** Step 1: is something important happening? Two rows; a wrong one is an error and the other can be picked. */
export function SpotStep(props: SpotStepProps) {
  return (
    <div class="pause-spot">
      <h2 class="pause-title">{COPY.spotTitle}</h2>
      <SubLine text={props.sub} right={props.right} />
      <div class="pause-choices" role="group" aria-label={COPY.spotTitle}>
        <Choice isYes={true} {...props} />
        <Choice isYes={false} {...props} />
      </div>
    </div>
  );
}
