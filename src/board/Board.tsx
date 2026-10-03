import { useEffect, useRef } from 'preact/hooks';
import type { Side } from '../content/types';
import './board.css';
import { createBoardController, type CmBoardController } from './controller';
import type { BoardController } from './types';

export interface BoardProps {
  /** Position shown first; later changes go through the controller. */
  fen: string;
  orientation: Side;
  onReady: (board: BoardController) => void;
}

export function Board({ fen, orientation, onReady }: BoardProps) {
  const host = useRef<HTMLDivElement>(null);
  const controller = useRef<CmBoardController | null>(null);

  useEffect(() => {
    const board = createBoardController(host.current!, fen, orientation);
    controller.current = board;
    onReady(board);
    return () => board.destroy();
  }, []);

  useEffect(() => {
    controller.current?.setOrientation(orientation);
  }, [orientation]);

  return <div class="board-host" ref={host} />;
}
