import type { BoardController } from '../board/types';
import type { Game } from '../content/types';

export interface MissCardProps {
  game: Game;
  turnIndex: number;
  playedUci: string;
  board: BoardController;
  onContinue: () => void;
}

/** Shown after a silent check the user missed: what they missed, a stepper, then continue. */
export function MissCard(_props: MissCardProps) {
  return null;
}
