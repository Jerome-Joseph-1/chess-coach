import { CheckPop } from '../../ui/CheckPop';
import { COPY } from '../copy';

export interface SpotStepProps {
  /** What the opponent just did, in plain words. */
  sub: string;
  /** The right answer is "Yes". */
  expectYes: boolean;
  /** The user's answer, once given. */
  picked: boolean | null;
  onAnswer: (yes: boolean) => void;
}

type ChoiceState = 'idle' | 'right' | 'wrong' | 'dim';

function stateOf(isYes: boolean, { expectYes, picked }: SpotStepProps): ChoiceState {
  if (picked !== isYes) return picked === null ? 'idle' : 'dim';
  return isYes === expectYes ? 'right' : 'wrong';
}

function Choice({ isYes, ...props }: SpotStepProps & { isYes: boolean }) {
  const state = stateOf(isYes, props);
  return (
    <button
      type="button"
      class={`pause-choice is-${state}`}
      aria-disabled={props.picked !== null}
      onClick={() => props.picked === null && props.onAnswer(isYes)}
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

/** Stage 1: is something important happening? Two rows, then the flow moves on by itself. */
export function SpotStep(props: SpotStepProps) {
  return (
    <div class="pause-spot">
      <h2 class="pause-title">{COPY.spotTitle}</h2>
      <p class="pause-sub">{props.sub}</p>
      <div class="pause-choices" role="group" aria-label={COPY.spotTitle}>
        <Choice isYes={true} {...props} />
        <Choice isYes={false} {...props} />
      </div>
      <p class="pause-foot">{COPY.spotFooter}</p>
    </div>
  );
}
