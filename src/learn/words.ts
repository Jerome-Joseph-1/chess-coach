import type { Color, Move, PieceSymbol } from 'chess.js';
import { NAME, VALUE } from '../board/captions';
import type { PieceAt } from './board';
import type { Trade } from './trade';

const COUNT = ['', 'a', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight'];

export function colorName(color: Color): string {
  return color === 'w' ? 'White' : 'Black';
}

/** "knight on f6" */
export function onSquare(piece: PieceAt): string {
  return `${NAME[piece.type]} on ${piece.square}`;
}

/** "your knight on f6" for the user's pieces, "the knight on f6" for the opponent's; kings go without a square. */
export function refer(piece: PieceAt, user: Color): string {
  const owner = piece.color === user ? 'your' : 'the';
  return piece.type === 'k' ? `${owner} king` : `${owner} ${onSquare(piece)}`;
}

/** "the knight on c6, the rook on a8 and the queen on d8" */
export function listOf(items: string[]): string {
  if (items.length < 2) return items[0] ?? '';
  return `${items.slice(0, -1).join(', ')} and ${items.at(-1)}`;
}

/** "the queen", "a rook", "two pawns"; `queen` names a single queen, as "your queen" for the side giving it up. */
function counted(type: PieceSymbol, n: number, queen: string): string {
  if (n > 1) return `${COUNT[n] ?? n} ${NAME[type]}s`;
  return type === 'q' ? queen : `a ${NAME[type]}`;
}

/** "a knight and a pawn", biggest first. */
function material(types: PieceSymbol[], queen = 'the queen'): string {
  const counts = new Map<PieceSymbol, number>();
  for (const type of [...types].sort((a, b) => VALUE[b] - VALUE[a])) counts.set(type, (counts.get(type) ?? 0) + 1);
  return listOf([...counts].map(([type, n]) => counted(type, n, queen)));
}

/** What the tactic wins: "a knight", "the queen for a knight", "a rook and a new queen for your queen". */
export function tradeText(trade: Trade): string {
  const won = [material(trade.won), ...trade.promoted.map((type) => `a new ${NAME[type]}`)].filter(Boolean);
  if (!won.length) return 'material';
  const lost = trade.lost.length ? ` for ${material(trade.lost, 'your queen')}` : '';
  return listOf(won) + lost;
}

/** "Rxe8+ Qxe8" */
export function sequence(moves: Move[]): string {
  return moves.map((m) => m.san).join(' ');
}

export function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}
