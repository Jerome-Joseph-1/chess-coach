import { COPY } from '../copy';
import { DockButton } from '../Dock';

export interface LinkProps {
  label: string;
  onClick: () => void;
}

/** A small muted text link: the quiet way to a second look. */
export function TextLink({ label, onClick }: LinkProps) {
  return (
    <button type="button" class="pause-link" onClick={onClick}>
      {label}
    </button>
  );
}

export interface PlayActionsProps {
  /** What the next hint shows, e.g. "Hint: the idea"; faded once every hint is used. */
  hintLabel: string;
  hintsLeft: boolean;
  disabled: boolean;
  onHint: () => void;
  onSolution: () => void;
}

/** Show solution is quiet text; Hint, the grey pill, comes last and takes the rest of the row. */
export function PlayActions({ hintLabel, hintsLeft, disabled, onHint, onSolution }: PlayActionsProps) {
  return (
    <div class="dock-row">
      <DockButton look="quiet" icon="eye" label={COPY.showSolution} disabled={disabled} onClick={onSolution} />
      <DockButton look="secondary" wide icon="lightbulb" label={hintLabel} fade disabled={disabled || !hintsLeft} onClick={onHint} />
    </div>
  );
}

export interface RetryActionsProps {
  hintLabel: string;
  hintsLeft: boolean;
  onHint: () => void;
  onRetry: () => void;
}

/** While the board shows what a wrong move loses: Try again takes it back, and Hint takes it back with the next hint. */
export function RetryActions({ hintLabel, hintsLeft, onHint, onRetry }: RetryActionsProps) {
  return (
    <div class="dock-row">
      <DockButton look="secondary" icon="lightbulb" label={hintLabel} fade disabled={!hintsLeft} onClick={onHint} />
      <DockButton look="primary" wide nudge icon="undo" label={COPY.retry} onClick={onRetry} />
    </div>
  );
}

export interface RevealActionsProps {
  onContinue: () => void;
  /** Opens the engine's look at the move on show; left out where there is no line to ask about. */
  onWhy?: () => void;
  whyDisabled?: boolean;
  /** The line has played through: Continue is what comes next. */
  nudge?: boolean;
}

/** "Why this move?" is the grey pill; Continue, the white one, comes last and is never the narrower. */
export function RevealActions({ onContinue, onWhy, whyDisabled = false, nudge = false }: RevealActionsProps) {
  return (
    <div class="dock-row">
      {onWhy && <DockButton look="secondary" icon="search" label={COPY.whyMove} disabled={whyDisabled} onClick={onWhy} />}
      <DockButton look="primary" wide nudge={nudge} label={COPY.next} onClick={onContinue} />
    </div>
  );
}
