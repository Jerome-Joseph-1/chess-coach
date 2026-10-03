import type { StepName, StepOutcome } from '../../content/types';
import { Button } from '../../ui/Button';
import { COPY } from '../copy';
import { CheckIcon, CrossIcon } from './icons';
import { Pips } from './Pips';

export interface SpotStepProps {
  /** The right answer is "Something's up". */
  expectUp: boolean;
  /** The user's answer, once given. */
  picked: boolean | null;
  planned: StepName[];
  outcomes: StepOutcome[];
  onAnswer: (up: boolean) => void;
}

function answerClass(isUp: boolean, { expectUp, picked }: SpotStepProps): string {
  if (picked === null) return '';
  const isRight = isUp === expectUp;
  const isPicked = picked === isUp;
  const tone = isRight ? 'is-right' : isPicked ? 'is-wrong' : 'is-dim';
  return isPicked ? `${tone} is-picked` : tone;
}

function Answer({ isUp, ...props }: SpotStepProps & { isUp: boolean }) {
  const cls = answerClass(isUp, props);
  return (
    <Button
      variant="secondary"
      size="lg"
      class={`pause-answer ${cls}`}
      aria-disabled={props.picked !== null}
      onClick={() => props.picked === null && props.onAnswer(isUp)}
    >
      {isUp ? COPY.spotYes : COPY.spotNo}
      {cls.includes('is-right') && (
        <span class="pause-badge is-good">
          <CheckIcon />
        </span>
      )}
      {cls.includes('is-wrong') && (
        <span class="pause-badge is-bad">
          <CrossIcon />
        </span>
      )}
    </Button>
  );
}

export function SpotStep(props: SpotStepProps) {
  const right = props.picked === props.expectUp;
  return (
    <div class="pause-spot">
      <Pips planned={props.planned} outcomes={props.outcomes} />
      <h2 class="pause-question">{COPY.spotQuestion}</h2>
      <p class="pause-help">{COPY.spotHelp}</p>
      <div class="pause-answers">
        <Answer isUp={true} {...props} />
        <Answer isUp={false} {...props} />
      </div>
      <p class={`pause-verdict ${props.picked === null ? '' : right ? 'is-good' : 'is-bad'}`} aria-live="polite">
        {props.picked === null ? '' : right ? COPY.spotRight : COPY.spotWrong}
      </p>
    </div>
  );
}
