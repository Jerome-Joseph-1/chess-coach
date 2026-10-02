import type { BoardController } from '../board/types';
import type { Side } from '../content/types';

export interface LineOption {
  id: 'threat' | 'best' | 'yours' | 'mistake' | 'refutation';
  label: string;
  /** Position the line starts from. */
  fen: string;
  moves: string[];
}

export interface LineStepperProps {
  board: BoardController;
  /** The position to come back to. */
  homeFen: string;
  userSide: Side;
  lines: LineOption[];
}

export function LineStepper(_props: LineStepperProps) {
  return null;
}
