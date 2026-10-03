import type { ComponentChildren, RefObject } from 'preact';
import type { StepName, StepOutcome } from '../../content/types';
import { CheckIcon, CrossIcon } from './icons';
import { Pips } from './Pips';

export interface PromptBarProps {
  text: string;
  /** Shows a check or a cross in front of the text. */
  tone?: 'good' | 'bad';
  planned: StepName[];
  outcomes: StepOutcome[];
  innerRef: RefObject<HTMLDivElement>;
  children?: ComponentChildren;
}

/** The slim line the sheet collapses to while the user works on the board. */
export function PromptBar({ text, tone, planned, outcomes, innerRef, children }: PromptBarProps) {
  return (
    <div class="pause-bar" ref={innerRef}>
      {tone && <span class={`pause-badge is-${tone} is-inline`}>{tone === 'good' ? <CheckIcon /> : <CrossIcon />}</span>}
      <p class="pause-bar-text" aria-live="polite">
        {text}
      </p>
      {children}
      <Pips planned={planned} outcomes={outcomes} />
    </div>
  );
}
