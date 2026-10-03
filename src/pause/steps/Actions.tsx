import '../../ui/button.css';
import { Button } from '../../ui/Button';
import { COPY } from '../copy';

export interface LinkProps {
  label: string;
  onClick: () => void;
}

/** A small muted text link: the quiet way to a second look under the one action that matters. */
export function TextLink({ label, onClick }: LinkProps) {
  return (
    <button type="button" class="pause-link" onClick={onClick}>
      {label}
    </button>
  );
}

export interface PlayActionsProps {
  /** "Hint", then "Show the move"; null once the move is shown. */
  hintLabel: string | null;
  disabled: boolean;
  onHint: () => void;
  onSolution: () => void;
}

/** Hint and Show solution, side by side and equal. Hint leaves a gap when it is used up, so the other does not move. */
export function PlayActions({ hintLabel, disabled, onHint, onSolution }: PlayActionsProps) {
  return (
    <div class="pause-actions is-pair">
      {hintLabel ? (
        <button type="button" class="btn btn-secondary btn-lg" disabled={disabled} onClick={onHint}>
          {hintLabel}
        </button>
      ) : (
        <span />
      )}
      <button type="button" class="btn btn-secondary btn-lg" disabled={disabled} onClick={onSolution}>
        {COPY.showSolution}
      </button>
    </div>
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
