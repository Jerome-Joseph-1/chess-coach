import type { BoardController } from '../../board/types';
import type { Side } from '../../content/types';
import { Button } from '../../ui/Button';
import { COPY } from '../copy';
import { LineStepper, type LineOption } from '../LineStepper';

export interface RevealStepProps {
  board: BoardController;
  userSide: Side;
  homeFen: string;
  lines: LineOption[];
  initialLine: LineOption['id'];
  headline: string;
  /** Extra line under the headline, e.g. why the game goes on with a different move. */
  note?: string;
  /** A repeat attempt: the first try is what counts. */
  practice: boolean;
  /** The sheet is handing the board back; the stepper must stop moving it. */
  frozen?: boolean;
  onRetry: () => void;
  onContinue: () => void;
}

export function RevealStep(props: RevealStepProps) {
  return (
    <div class="pause-reveal">
      <h2 class="pause-headline">{props.headline}</h2>
      {props.note && <p class="pause-sub">{props.note}</p>}
      {props.practice && <p class="pause-sub">{COPY.practice}</p>}
      <LineStepper
        board={props.board}
        homeFen={props.homeFen}
        userSide={props.userSide}
        lines={props.lines}
        initial={props.initialLine}
        frozen={props.frozen}
      />
      <div class="pause-actions">
        <Button variant="secondary" size="lg" onClick={props.onRetry}>
          {COPY.tryAgain}
        </Button>
        <Button variant="primary" size="lg" onClick={props.onContinue}>
          {COPY.next}
        </Button>
      </div>
    </div>
  );
}
