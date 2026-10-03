import type { RefObject } from 'preact';
import { useEffect, useRef } from 'preact/hooks';
import { CoachBubble, PatternLabel, StepDots, type PatternLabelProps } from '../Coach';
import type { HintLadder as Ladder } from '../hints';
import type { Prompt } from '../prompt';
import { scrollIntoPanel } from '../Sheet';
import { HintLadder } from './HintLadder';

export interface QuestionProps extends Prompt {
  eyebrow: string;
  step: number | null;
  total: number;
  /** Shown in place of the eyebrow once a hint has named the pattern. */
  pattern?: PatternLabelProps;
  /** Shown once a hint is used. */
  ladder?: Ladder;
  innerRef?: RefObject<HTMLDivElement>;
}

/** Every question of a pause, in the coach's bubble: where we are, the question, and the line that answers back. */
export function Question({ eyebrow, step, total, pattern, ladder, innerRef, title, sub, tone }: QuestionProps) {
  const ladderRef = useRef<HTMLDivElement>(null);
  useEffect(() => scrollIntoPanel(ladderRef.current), [ladder?.used]);
  return (
    <CoachBubble
      tone={tone}
      eyebrow={eyebrow}
      lead={pattern && <PatternLabel {...pattern} />}
      aside={step !== null && <StepDots step={step} total={total} />}
      title={title}
      body={sub}
      live
      innerRef={innerRef}
    >
      {ladder && ladder.used > 0 && (
        <div class="coach-ladder rise-in" ref={ladderRef}>
          <HintLadder {...ladder} />
        </div>
      )}
    </CoachBubble>
  );
}
