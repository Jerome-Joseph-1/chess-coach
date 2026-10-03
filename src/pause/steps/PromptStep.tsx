import type { RefObject } from 'preact';

export interface PromptStepProps {
  title: string;
  sub: string;
  innerRef: RefObject<HTMLDivElement>;
}

/** Stages 2 to 5: a title and one line, so the board stays the star. */
export function PromptStep({ title, sub, innerRef }: PromptStepProps) {
  return (
    <div class="pause-prompt" ref={innerRef}>
      <h2 class="pause-title">{title}</h2>
      <p class="pause-sub" aria-live="polite">
        {sub}
      </p>
    </div>
  );
}
