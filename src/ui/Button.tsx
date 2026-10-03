import type { ComponentChildren, JSX } from 'preact';
import './button.css';

export interface ButtonProps extends Omit<JSX.HTMLAttributes<HTMLButtonElement>, 'size'> {
  variant?: 'primary' | 'good' | 'secondary' | 'ghost';
  size?: 'md' | 'lg';
  children: ComponentChildren;
}

export function Button({ variant = 'primary', size = 'md', class: cls, children, ...rest }: ButtonProps) {
  return (
    <button type="button" class={`btn btn-${variant} btn-${size} ${cls ?? ''}`} {...rest}>
      {children}
    </button>
  );
}
