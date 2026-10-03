import { useState } from 'preact/hooks';
import type { BoardController } from '../../board/types';
import type { Side } from '../../content/types';
import { Analysis } from '../../engine/Analysis';
import type { PatternLabelProps } from '../Coach';
import { COPY, type ResultLine } from '../copy';
import { LineStepper } from '../LineStepper';
import type { Sequence } from '../sequence';
import { Remember, ResultBubble } from './Result';

export interface RevealStepProps {
  board: BoardController;
  userSide: Side;
  sequence: Sequence;
  result: ResultLine;
  headline: string;
  /** The pattern's label and the takeaway, when the position teaches one. */
  lesson?: { pattern: PatternLabelProps; remember: string };
  /** Extra line under the headline, e.g. why the game goes on with a different move. */
  note?: string;
  /** The panel is handing the board back; the stepper must stop moving it. */
  frozen?: boolean;
  /** The line's step the engine looks at, or null while the line is on show. */
  why: number | null;
  /** The line can be watched again. */
  replayable: boolean;
  onStep: (at: number) => void;
  /** Back from the engine's look to the line. */
  onLine: () => void;
  /** Told once the line has played through. */
  onFinished?: () => void;
}

/**
 * The answer: the moves playing themselves in a stepper, the verdict with the pattern and one sentence on why,
 * then, once the line has played, the takeaway. "Why this move?" swaps the line for the engine's look.
 */
export function RevealStep(props: RevealStepProps) {
  const [resumeAt, setResumeAt] = useState<number>();
  const [lineDone, setLineDone] = useState(false);
  const step = props.why === null ? undefined : props.sequence.steps[props.why - 1];

  if (step) {
    return (
      <div class="pause-answer">
        <Analysis
          board={props.board}
          fen={step.before}
          userSide={props.userSide}
          played={step.uci}
          closeLabel={COPY.backToLine}
          frozen={props.frozen}
          onClose={() => {
            setResumeAt(props.why!);
            props.onLine();
          }}
        />
      </div>
    );
  }
  return (
    <div class="pause-answer">
      <LineStepper
        board={props.board}
        userSide={props.userSide}
        sequence={props.sequence}
        frozen={props.frozen}
        startAt={resumeAt}
        replayable={props.replayable}
        onStep={props.onStep}
        onFinished={() => {
          setLineDone(true);
          props.onFinished?.();
        }}
      />
      <ResultBubble result={props.result} text={props.headline} pattern={props.lesson?.pattern} note={props.note} />
      {props.lesson && (lineDone || !props.sequence.steps.length) && (
        <div class="remember-in">
          <Remember text={props.lesson.remember} />
        </div>
      )}
    </div>
  );
}
