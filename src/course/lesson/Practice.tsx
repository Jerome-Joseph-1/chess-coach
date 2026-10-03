import { Chess } from 'chess.js';
import { useEffect, useState } from 'preact/hooks';
import type { BoardController } from '../../board/types';
import type { Game } from '../../content/types';
import { PauseSheet, type PauseOutcome, type PauseStage } from '../../pause/PauseSheet';
import type { LessonPosition } from '../select';

export interface PracticeProps {
  board: BoardController;
  position: LessonPosition;
  onStage: (stage: PauseStage) => void;
  onDone: (result: PauseOutcome) => void;
}

/** The position before the opponent's last move, and that move, so the board can show how the position came about. */
export function lastMoveInto(game: Game, ply: number): { before: string; uci: string } | null {
  const sans = [...game.start, ...game.moves.slice(0, ply)];
  const chess = new Chess();
  try {
    sans.slice(0, -1).forEach((san) => chess.move(san));
    const before = chess.fen();
    const move = chess.move(sans.at(-1)!);
    return { before, uci: move.from + move.to + (move.promotion ?? '') };
  } catch {
    return null;
  }
}

async function setUp(board: BoardController, { game, turnIndex }: LessonPosition): Promise<void> {
  const last = lastMoveInto(game, game.turns[turnIndex].ply);
  if (!last) return board.setPosition(game.turns[turnIndex].fen, false);
  await board.setPosition(last.before, false);
  await board.playMove(last.uci);
}

/** One practice position: the opponent's last move plays in, then the pause asks for the move with the pattern named. */
export function Practice({ board, position, onStage, onDone }: PracticeProps) {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let current = true;
    void setUp(board, position).then(() => current && setReady(true));
    return () => {
      current = false;
    };
  }, []);

  if (!ready) return <div class="pause-sheet" aria-busy="true" />;
  return (
    <PauseSheet
      game={position.game}
      turnIndex={position.turnIndex}
      type="pause"
      depth={1}
      board={board}
      mode="drill"
      onStage={onStage}
      onDone={onDone}
    />
  );
}
