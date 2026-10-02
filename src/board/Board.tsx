import type { Side } from '../content/types';
import type { BoardController } from './types';

export interface BoardProps {
  fen: string;
  orientation: Side;
  onReady: (board: BoardController) => void;
}

export function Board(_props: BoardProps) {
  return <div class="board-placeholder" />;
}
