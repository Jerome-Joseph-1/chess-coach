import type { RefObject } from 'preact';
import { SubLine } from './SubLine';

export interface PromptStepProps {
  title: string;
  sub: string;
  /** The sub line confirms a right answer. */
  right: boolean;
  innerRef: RefObject<HTMLDivElement>;
}

/** Steps 2 and 3: a title and one line, so the board stays the star. */
export function PromptStep({ title, sub, right, innerRef }: PromptStepProps) {
  return (
    <div class="pause-prompt" ref={innerRef}>
      <h2 class="pause-title">{title}</h2>
      <SubLine text={sub} right={right} mark />
    </div>
  );
}
