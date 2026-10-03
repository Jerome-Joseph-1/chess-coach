import { CHECK_PATH, CROSS_PATH } from './checkPop';
import './rewards.css';

export interface CheckPopProps {
  /** A check for a right answer, a cross for a wrong one. */
  tone?: 'success' | 'danger';
}

/** The 22px mark that fills in a choice row. It pops in when it first renders. */
export function CheckPop({ tone = 'success' }: CheckPopProps) {
  return (
    <span class={`mark is-${tone}`} aria-hidden="true">
      <svg viewBox="0 0 24 24">
        <path d={tone === 'success' ? CHECK_PATH : CROSS_PATH} />
      </svg>
    </span>
  );
}
