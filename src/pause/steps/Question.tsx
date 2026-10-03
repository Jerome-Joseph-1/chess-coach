import type { RefObject } from 'preact';
import { CoachBubble, PatternLabel, StepDots, type PatternLabelProps } from '../Coach';
import type { HintLadder as Ladder } from '../hints';
import type { Prompt } from '../prompt';
import { HintLadder } from './HintLadder';

export interface QuestionProps extends Prompt {
  eyebrow: string;
  step: number | null;
  total: number;
  /** Shown in place of the eyebrow once a hint has named the pattern. */
  pattern?: PatternLabelProps;
  /** The hints, shown from the start of a step that plays on the board so the panel does not grow when one is taken. */
  ladder?: Ladder;
  innerRef?: RefObject<HTMLDivElement>;
}

/** Every question of a pause, in the coach's bubble: where we are, the question, and the line that answers back. */
export function Question({ eyebrow, step, total, pattern, ladder, innerRef, title, sub, tone }: QuestionProps) {
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
      {ladder && (
        <div class="coach-ladder rise-in" style={{ '--i': 3 }}>
          <HintLadder {...ladder} />
        </div>
      )}
    </CoachBubble>
  );
}
