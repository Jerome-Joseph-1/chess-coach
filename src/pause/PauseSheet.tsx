import type { BoardController } from '../board/types';
import type { Depth, Game, StepOutcome } from '../content/types';

export interface PauseResult {
  outcomes: StepOutcome[];
  /** Index into game.moves where the game resumes after the pause and its play-out. */
  resumePly: number;
}

export interface PauseSheetProps {
  game: Game;
  /** Index into game.turns. */
  turnIndex: number;
  type: 'pause' | 'nothing';
  depth: Depth;
  board: BoardController;
  onDone: (result: PauseResult) => void;
}

export function PauseSheet(_props: PauseSheetProps) {
  return null;
}
