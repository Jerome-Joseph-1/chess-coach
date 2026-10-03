import type { BoardController } from '../../board/types';
import type { Side } from '../../content/types';
import { COPY, type ResultLine } from '../copy';
import { LineStepper, type LineOption } from '../LineStepper';
import { ResultRow } from './ResultRow';
import { SubLine } from './SubLine';

export interface RevealStepProps {
  board: BoardController;
  userSide: Side;
  homeFen: string;
  lines: LineOption[];
  initialLine: LineOption['id'];
  result: ResultLine;
  headline: string;
  /** Extra line under the headline, e.g. why the game goes on with a different move. */
  note?: string;
  /** A repeat attempt: the first try is what counts. */
  practice: boolean;
  /** The sheet is handing the board back; the stepper must stop moving it. */
  frozen?: boolean;
}

export function RevealStep(props: RevealStepProps) {
  return (
    <div class="pause-reveal">
      <ResultRow result={props.result} />
      <h2 class="pause-title">{props.headline}</h2>
      {props.note && <SubLine text={props.note} />}
      {props.practice && <SubLine text={COPY.practice} />}
      <LineStepper
        board={props.board}
        homeFen={props.homeFen}
        userSide={props.userSide}
        lines={props.lines}
        initial={props.initialLine}
        frozen={props.frozen}
      />
    </div>
  );
}
