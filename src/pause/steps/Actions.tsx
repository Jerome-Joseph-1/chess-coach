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
  /** "Hint · 1 of 3"; it stays on the last rung, faded, once every hint is used. */
  hintLabel: string;
  hintsLeft: boolean;
  disabled: boolean;
  onHint: () => void;
  onSolution: () => void;
}

/** Hint is the grey pill; Show solution stays a quiet text button beside it. */
export function PlayActions({ hintLabel, hintsLeft, disabled, onHint, onSolution }: PlayActionsProps) {
  return (
    <div class="dock-row">
      <DockButton look="secondary" wide icon="lightbulb" label={hintLabel} fade disabled={disabled || !hintsLeft} onClick={onHint} />
      <DockButton look="quiet" icon="eye" label={COPY.showSolution} disabled={disabled} onClick={onSolution} />
    </div>
  );
}

export interface RevealActionsProps {
  onContinue: () => void;
  /** Opens the engine's look at the move on show; left out where there is no line to ask about. */
  onWhy?: () => void;
  whyDisabled?: boolean;
}

/** Continue is the white pill; "Why this move?" sits beside it as the grey one. */
export function RevealActions({ onContinue, onWhy, whyDisabled = false }: RevealActionsProps) {
  return (
    <div class="dock-row">
      {onWhy && <DockButton look="secondary" icon="search" label={COPY.whyMove} disabled={whyDisabled} onClick={onWhy} />}
      <DockButton look="primary" wide label={COPY.next} onClick={onContinue} />
    </div>
  );
}
