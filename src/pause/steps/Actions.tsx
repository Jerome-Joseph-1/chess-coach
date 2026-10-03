import '../../ui/button.css';
import { Button } from '../../ui/Button';
import { COPY } from '../copy';

export interface SkipProps {
  label: string;
  disabled: boolean;
  onSkip: () => void;
}

/** The way out of a question that plays on the board: one quiet, full-width pill. */
export function SkipAction({ label, disabled, onSkip }: SkipProps) {
  return (
    <button type="button" class="btn btn-secondary btn-lg" disabled={disabled} onClick={onSkip}>
      {label}
    </button>
  );
}

export interface RevealActionsProps {
  /** Left out where trying again makes no sense, e.g. a quiet position. */
  onRetry?: () => void;
  onContinue: () => void;
}

/** Try again and Continue, side by side and equal; Continue is the one ink action. */
export function RevealActions({ onRetry, onContinue }: RevealActionsProps) {
  return (
    <div class={`pause-actions${onRetry ? '' : ' is-single'}`}>
      {onRetry && (
        <Button variant="secondary" size="lg" onClick={onRetry}>
          {COPY.tryAgain}
        </Button>
      )}
      <Button variant="primary" size="lg" onClick={onContinue}>
        {COPY.next}
      </Button>
    </div>
  );
}
