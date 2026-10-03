import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import sprite from 'cm-chessboard/assets/pieces/standard.svg?url';
import type { BoardController } from '../../board/types';
import type { Side } from '../../content/types';
import { LabBoardModel, cellOf, squareAtCell, type BoardView, type PieceView } from './labBoardModel';
import './lab.css';

export interface LabBoardProps {
  fen: string;
  orientation: Side;
  onReady: (board: BoardController) => void;
}

const FILES = 'abcdefgh';

function squareClass(square: string, view: BoardView, col: number, row: number): string {
  const classes = ['lab-sq', (col + row) % 2 ? 'is-dark' : 'is-light'];
  const tone = view.highlights[square];
  if (tone) classes.push(`is-${tone}`);
  if (view.lastMove.includes(square)) classes.push('is-last');
  if (view.selected === square) classes.push('is-selected');
  if (view.targets.includes(square)) classes.push('is-target');
  if (view.dim && !view.dim.includes(square)) classes.push('is-dim');
  return classes.join(' ');
}

function Piece({ piece, view, orientation }: { piece: PieceView; view: BoardView; orientation: Side }) {
  const { col, row } = cellOf(piece.square, orientation);
  const dragging = view.drag?.id === piece.id;
  const style = { '--x': col, '--y': row, '--dx': `${dragging ? view.drag!.dx : 0}px`, '--dy': `${dragging ? view.drag!.dy : 0}px` };
  return (
    <svg class={`lab-piece${piece.leaving ? ' is-leaving' : ''}${dragging ? ' is-dragging' : ''}`} viewBox="0 0 40 40" style={style} aria-hidden="true">
      <use href={`${sprite}#${piece.type}`} />
    </svg>
  );
}

/** A plain board for the pause lab: tap or drag to move, tap to pick a square. Drives the same BoardController as the real one. */
export function LabBoard({ fen, orientation, onReady }: LabBoardProps) {
  const model = useMemo(() => new LabBoardModel(fen, orientation), []);
  const [view, setView] = useState(model.view);
  const el = useRef<HTMLDivElement>(null);

  useEffect(() => {
    model.attach(el.current!);
    const off = model.subscribe(setView);
    onReady(model);
    return off;
  }, []);

  const squares = [];
  for (let row = 0; row < 8; row++) {
    for (let col = 0; col < 8; col++) {
      const square = squareAtCell(col, row, orientation);
      squares.push(
        <div
          key={square}
          class={squareClass(square, view, col, row)}
          data-square={square}
          data-file={row === 7 ? FILES[FILES.indexOf(square[0])] : undefined}
          data-rank={col === 0 ? square[1] : undefined}
        />,
      );
    }
  }

  return (
    <div
      class="lab-board"
      ref={el}
      data-animate={view.animate}
      onPointerDown={(e) => {
        el.current?.setPointerCapture(e.pointerId);
        model.pointerDown(e.clientX, e.clientY);
      }}
      onPointerMove={(e) => model.pointerMove(e.clientX, e.clientY)}
      onPointerUp={(e) => model.pointerUp(e.clientX, e.clientY)}
    >
      {squares}
      {view.pieces.map((piece) => (
        <Piece key={piece.id} piece={piece} view={view} orientation={orientation} />
      ))}
    </div>
  );
}
