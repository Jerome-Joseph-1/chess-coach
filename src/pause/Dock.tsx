import type { ButtonHTMLAttributes, ComponentChildren } from 'preact';
import '../ui/button.css';
import { CrossFade } from './CrossFade';
import { Icon, type IconName } from './steps/icons';

/** The one bar at the bottom of the game screen; the main action always sits in its last row. */
export function Dock({ children, label }: { children: ComponentChildren; label?: string }) {
  return (
    <div class="dock" role="group" aria-label={label}>
      {children}
    </div>
  );
}

export interface DockButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'icon' | 'label'> {
  /** The white pill, a grey pill, or quiet text. */
  look: 'primary' | 'secondary' | 'quiet';
  label: string;
  icon?: IconName;
  /** Cross-fade the label in place when it changes. */
  fade?: boolean;
  /** Grow to share the row. */
  wide?: boolean;
}

export function DockButton({ look, label, icon, fade = false, wide = false, class: cls, ...rest }: DockButtonProps) {
  const looks = { primary: 'btn btn-primary', secondary: 'btn btn-secondary', quiet: 'dock-quiet' };
  const content = (
    <>
      {icon && <Icon name={icon} size={20} />}
      {label}
    </>
  );
  return (
    <button type="button" class={`dock-btn ${looks[look]}${wide ? ' is-wide' : ''}${cls ? ` ${cls}` : ''}`} {...rest}>
      {fade ? <CrossFade value={`${icon}:${label}`}>{content}</CrossFade> : content}
    </button>
  );
}

export interface RoundButtonProps {
  icon: IconName;
  label: string;
  disabled?: boolean;
  onClick: () => void;
}

/** A 52px round button, e.g. a step back or forward beside the main action. */
export function RoundButton({ icon, label, disabled = false, onClick }: RoundButtonProps) {
  return (
    <button type="button" class="dock-round" aria-label={label} disabled={disabled} onClick={onClick}>
      <Icon name={icon} />
    </button>
  );
}
