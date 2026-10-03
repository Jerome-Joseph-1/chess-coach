import { Chess, type Square } from 'chess.js';
import pieceSprite from 'cm-chessboard/assets/pieces/standard.svg?no-inline';
import type { Side } from '../../content/types';

// The piece sprite draws every piece in a 40 unit square.
const CELL = 40;
const FILES = 'abcdefgh';

interface Cell {
  square: Square;
  x: number;
  y: number;
}

function cells(side: Side): Cell[] {
  return Array.from({ length: 64 }, (_, i) => {
    const col = i % 8;
    const row = Math.floor(i / 8);
    const file = side === 'w' ? col : 7 - col;
    const rank = side === 'w' ? 8 - row : row + 1;
    return { square: `${FILES[file]}${rank}` as Square, x: col * CELL, y: row * CELL };
  });
}

function isDark(square: Square): boolean {
  return (FILES.indexOf(square[0]) + Number(square[1])) % 2 === 1;
}

/** A small picture of the position the next game starts from, seen from your side. */
export function MiniBoard({ moves, side }: { moves: string[]; side: Side }) {
  const chess = new Chess();
  for (const move of moves) chess.move(move);
  const last = chess.history({ verbose: true }).at(-1);
  const lit = new Set([last?.from, last?.to]);
  return (
    <svg class="mini-board" viewBox={`0 0 ${8 * CELL} ${8 * CELL}`} aria-hidden="true">
      {cells(side).map(({ square, x, y }) => {
        const piece = chess.get(square);
        return (
          <g key={square} transform={`translate(${x} ${y})`}>
            <rect class={isDark(square) ? 'sq-dark' : 'sq-light'} width={CELL} height={CELL} />
            {lit.has(square) && <rect class="sq-last" width={CELL} height={CELL} />}
            {piece && <use href={`${pieceSprite}#${piece.color}${piece.type}`} />}
          </g>
        );
      })}
    </svg>
  );
}
