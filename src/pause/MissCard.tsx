import { useMemo, useRef, useState } from 'preact/hooks';
import type { BoardController } from '../board/types';
import type { Game } from '../content/types';
import { MISSED, headline } from './copy';
import { LineStepper } from './LineStepper';
import { openingLine, revealLines } from './lines';
import { samePosition, sanOf } from './position';
import { Sheet } from './Sheet';
import { RevealActions } from './steps/Actions';
import { ResultRow } from './steps/ResultRow';
import { SubLine } from './steps/SubLine';

export interface MissCardProps {
  game: Game;
  turnIndex: number;
  playedUci: string;
  board: BoardController;
  onContinue: () => void;
}

/** Shown after a silent check the user missed: what they missed, a stepper, then continue. */
export function MissCard({ game, turnIndex, playedUci, board, onContinue }: MissCardProps) {
  const turn = game.turns[turnIndex];
  const lines = useMemo(() => revealLines(game, turnIndex, playedUci), [game, turnIndex, playedUci]);
  // Taken before the stepper first moves the board, so Continue can put it back.
  const [boardFen] = useState(() => board.fen());
  const [leaving, setLeaving] = useState(false);
  const sheetRef = useRef<HTMLDivElement>(null);

  async function leave() {
    setLeaving(true);
    if (!samePosition(board.fen(), boardFen)) await board.setPosition(boardFen, true);
    onContinue();
  }

  return (
    <Sheet innerRef={sheetRef} label={MISSED.text} footer={<RevealActions onContinue={leave} />}>
      <div class="pause-reveal">
        <ResultRow result={MISSED} />
        <h2 class="pause-title">{headline(game, turnIndex)}</h2>
        <SubLine text={`You played ${sanOf(turn.fen, playedUci)}.`} />
        <LineStepper
          board={board}
          homeFen={turn.fen}
          userSide={game.side}
          lines={lines}
          initial={openingLine(turn)}
          frozen={leaving}
        />
      </div>
    </Sheet>
  );
}
