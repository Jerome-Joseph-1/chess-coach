import '../../ui/button.css';
import { Button } from '../../ui/Button';
import { COPY } from '../copy';

export interface LinkProps {
  label: string;
  disabled?: boolean;
  onClick: () => void;
}

/** A small muted text link: the quiet way out under the one action that matters. */
export function TextLink({ label, disabled = false, onClick }: LinkProps) {
  return (
    <button type="button" class="pause-link" disabled={disabled} onClick={onClick}>
      {label}
    </button>
  );
}

export interface RevealActionsProps {
  onContinue: () => void;
  /** Left out where there is nothing to watch, e.g. a quiet position. */
  onReplay?: () => void;
}

/** Continue is the one action; Watch again sits under it as a link. */
export function RevealActions({ onContinue, onReplay }: RevealActionsProps) {
  return (
    <div class="pause-actions">
      <Button variant="primary" size="lg" onClick={onContinue}>
        {COPY.next}
      </Button>
      {onReplay && <TextLink label={COPY.watchAgain} onClick={onReplay} />}
    </div>
  );
}
