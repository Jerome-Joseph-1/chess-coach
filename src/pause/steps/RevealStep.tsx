import { useEffect, useState } from 'preact/hooks';
import type { BoardController } from '../../board/types';
import type { Side } from '../../content/types';
import { Analysis } from '../../engine/Analysis';
import { COPY, type ResultLine } from '../copy';
import { LineStepper } from '../LineStepper';
import type { Sequence } from '../sequence';
import { Remember, ResultRow } from './ResultRow';
import { SubLine } from './SubLine';

export interface RevealStepProps {
  board: BoardController;
  userSide: Side;
  sequence: Sequence;
  result: ResultLine;
  headline: string;
  /** The pattern's name and the takeaway, when the position teaches one. */
  lesson?: { name: string; remember: string };
  /** Extra line under the headline, e.g. why the game goes on with a different move. */
  note?: string;
  /** The sheet is handing the board back; the stepper must stop moving it. */
  frozen?: boolean;
  /** Counts up each time the user asks to watch the moves again. */
  replays: number;
  /** Told when the user opens or leaves the engine's look at a move. */
  onExplore?: (exploring: boolean) => void;
}

/**
 * The verdict, one sentence, and the moves playing themselves under a caption with an arrow on each side.
 * "Why this move?" swaps the line for the engine's look at the position before the move on show.
 */
export function RevealStep(props: RevealStepProps) {
  const [why, setWhy] = useState<number | null>(null);
  const [resumeAt, setResumeAt] = useState<number>();
  const step = why === null ? undefined : props.sequence.steps[why - 1];

  useEffect(() => props.onExplore?.(step !== undefined), [step]);

  if (step) {
    return (
      <div class="pause-reveal">
        <Analysis
          board={props.board}
          fen={step.before}
          userSide={props.userSide}
          played={step.uci}
          closeLabel={COPY.backToLine}
          frozen={props.frozen}
          onClose={() => {
            setResumeAt(why!);
            setWhy(null);
          }}
        />
      </div>
    );
  }
  return (
    <div class="pause-reveal">
      <ResultRow result={props.result} pattern={props.lesson?.name} />
      <h2 class="pause-title">{props.headline}</h2>
      {props.note && <SubLine text={props.note} />}
      <LineStepper
        board={props.board}
        userSide={props.userSide}
        sequence={props.sequence}
        frozen={props.frozen}
        replays={props.replays}
        startAt={resumeAt}
        onWhy={setWhy}
      />
      {props.lesson && <Remember text={props.lesson.remember} />}
    </div>
  );
}
