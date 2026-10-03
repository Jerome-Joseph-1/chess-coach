import { useMemo, useRef, useState } from 'preact/hooks';
import type { BoardController } from '../board/types';
import type { Game } from '../content/types';
import { Button } from '../ui/Button';
import { COPY, headline } from './copy';
import { LineStepper } from './LineStepper';
import { openingLine, revealLines } from './lines';
import { samePosition, sanOf } from './position';
import { Sheet } from './Sheet';

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
    <Sheet innerRef={sheetRef} label={COPY.missTitle}>
      <div class="pause-reveal">
        <h2 class="pause-headline">{COPY.missTitle}</h2>
        <p class="pause-note">{headline(game, turnIndex)}</p>
        <p class="pause-note is-muted">You played {sanOf(turn.fen, playedUci)}.</p>
        <LineStepper
          board={board}
          homeFen={turn.fen}
          userSide={game.side}
          lines={lines}
          initial={openingLine(turn)}
          frozen={leaving}
        />
        <div class="pause-actions">
          <Button variant="primary" size="lg" onClick={leave}>
            {COPY.next}
          </Button>
        </div>
      </div>
    </Sheet>
  );
}
