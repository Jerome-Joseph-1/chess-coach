import type { BoardController } from '../../board/types';
import type { Side } from '../../content/types';
import type { ResultLine } from '../copy';
import { LineStepper } from '../LineStepper';
import type { Sequence } from '../sequence';
import { ResultRow } from './ResultRow';
import { SubLine } from './SubLine';

export interface RevealStepProps {
  board: BoardController;
  userSide: Side;
  sequence: Sequence;
  result: ResultLine;
  headline: string;
  /** Extra line under the headline, e.g. why the game goes on with a different move. */
  note?: string;
  /** The sheet is handing the board back; the stepper must stop moving it. */
  frozen?: boolean;
  /** Counts up each time the user asks to watch the moves again. */
  replays: number;
}

/** The verdict, one sentence, and the moves playing themselves under a caption with an arrow on each side. */
export function RevealStep(props: RevealStepProps) {
  return (
    <div class="pause-reveal">
      <ResultRow result={props.result} />
      <h2 class="pause-title">{props.headline}</h2>
      {props.note && <SubLine text={props.note} />}
      <LineStepper board={props.board} userSide={props.userSide} sequence={props.sequence} frozen={props.frozen} replays={props.replays} />
    </div>
  );
}
