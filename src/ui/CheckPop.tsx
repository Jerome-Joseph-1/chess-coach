import { CHECK_PATH, CROSS_PATH, DASH_PATH } from './checkPop';
import './rewards.css';

export type MarkTone = 'success' | 'danger' | 'muted';

export interface CheckPopProps {
  /** A check for a right answer, a cross for a wrong one, a dash for neither. */
  tone?: MarkTone;
}

const GLYPHS: Record<MarkTone, string> = { success: CHECK_PATH, danger: CROSS_PATH, muted: DASH_PATH };

/** The 22px round mark that sits in a choice row or a result line. It pops in when it first renders. */
export function CheckPop({ tone = 'success' }: CheckPopProps) {
  return (
    <span class={`mark is-${tone}`} aria-hidden="true">
      <svg viewBox="0 0 24 24">
        <path d={GLYPHS[tone]} />
      </svg>
    </span>
  );
}
