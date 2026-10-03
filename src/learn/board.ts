import { Chess, type Color, type Move, type PieceSymbol, type Square } from 'chess.js';
import { SLIDER_DIRECTIONS, VALUE, otherColor, squareAt } from '../board/captions';
import { withTurn } from '../game/position';

/** A piece and the square it stands on. */
export interface PieceAt {
  square: Square;
  type: PieceSymbol;
  color: Color;
}

/** A piece that can't move without exposing a bigger piece behind it. */
export interface Pin {
  pinner: PieceAt;
  pinned: PieceAt;
  behind: PieceAt;
}

const ALL_DIRECTIONS = SLIDER_DIRECTIONS.q!;

export function pieceOn(chess: Chess, square: Square): PieceAt | null {
  const piece = chess.get(square);
  return piece ? { square, type: piece.type, color: piece.color } : null;
}

export function piecesOf(chess: Chess, color: Color): PieceAt[] {
  return chess
    .board()
    .flat()
    .flatMap((p) => (p && p.color === color ? [{ square: p.square, type: p.type, color }] : []));
}

/** Plays uci moves from `fen`, stopping at the first illegal one. */
export function playLine(fen: string, ucis: readonly string[]): Move[] {
  const chess = new Chess(fen);
  const moves: Move[] = [];
  for (const uci of ucis) {
    try {
      moves.push(chess.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] }));
    } catch {
      break;
    }
  }
  return moves;
}

export function uciOf(move: Move): string {
  return move.from + move.to + (move.promotion ?? '');
}

/** The position with the other side to move, as after a pass; null when the side to move is in check. */
export function passTurn(fen: string): string | null {
  const chess = new Chess(fen);
  return chess.inCheck() ? null : withTurn(fen, otherColor(chess.turn()));
}

/** The legal capture on `square` made with the cheapest piece, if any. */
function cheapestCapture(chess: Chess, square: Square): Move | null {
  const target = chess.get(square);
  if (!target || target.color === chess.turn()) return null;
  let best: Move | null = null;
  for (const from of chess.attackers(square, chess.turn())) {
    for (const move of chess.moves({ square: from, verbose: true })) {
      if (move.to === square && (!best || VALUE[move.piece] < VALUE[best.piece])) best = move;
    }
  }
  return best;
}

/** What the side to move wins by capturing on `square`, each side taking with its cheapest piece and free to stop. */
export function exchangeGain(chess: Chess, square: Square): number {
  const capture = cheapestCapture(chess, square);
  if (!capture) return 0;
  chess.move({ from: capture.from, to: capture.to, promotion: capture.promotion });
  const answer = exchangeGain(chess, square);
  chess.undo();
  return Math.max(0, VALUE[capture.captured!] - answer);
}

/** Material the mover nets from a capture once the exchange on that square has played out. */
export function captureGain(move: Move): number {
  if (!move.captured) return 0;
  const promotion = move.promotion ? VALUE[move.promotion] - 1 : 0;
  return VALUE[move.captured] + promotion - exchangeGain(new Chess(move.after), move.to);
}

/** Whether the opponent of the piece on `square` would win material by starting captures there. */
export function isLoose(fen: string, square: Square): boolean {
  const piece = new Chess(fen).get(square);
  if (!piece) return false;
  // A check on the piece's own side doesn't change who could take it, so the probe may skip validation.
  const probe = new Chess(withTurn(fen, otherColor(piece.color)), { skipValidation: true });
  return exchangeGain(probe, square) > 0;
}

/** Legal moves of the side to move that capture on `square`. */
export function capturesOn(chess: Chess, square: Square): Move[] {
  return chess.attackers(square, chess.turn()).flatMap((from) =>
    chess.moves({ square: from, verbose: true }).filter((m) => m.to === square),
  );
}

function coords(square: Square): [number, number] {
  return [square.charCodeAt(0) - 97, Number(square[1]) - 1];
}

/** The unit step from `a` towards `b` when they share a line, else null. */
export function directionTo(a: Square, b: Square): [number, number] | null {
  const [af, ar] = coords(a);
  const [bf, br] = coords(b);
  const df = bf - af;
  const dr = br - ar;
  if ((df === 0 && dr === 0) || (df !== 0 && dr !== 0 && Math.abs(df) !== Math.abs(dr))) return null;
  return [Math.sign(df), Math.sign(dr)];
}

/** Whether `square` lies strictly between `a` and `b` on a straight or diagonal line. */
export function isBetween(a: Square, square: Square, b: Square): boolean {
  const toSquare = directionTo(a, square);
  const toEnd = directionTo(a, b);
  if (!toSquare || !toEnd || toSquare[0] !== toEnd[0] || toSquare[1] !== toEnd[1]) return false;
  const [af, ar] = coords(a);
  const distance = (s: Square) => Math.max(Math.abs(coords(s)[0] - af), Math.abs(coords(s)[1] - ar));
  return distance(square) < distance(b);
}

export function slidesAlong(type: PieceSymbol, [df, dr]: [number, number]): boolean {
  return (SLIDER_DIRECTIONS[type] ?? []).some(([f, r]) => f === df && r === dr);
}

/** The first two pieces met walking from `from` in one direction. */
export function piecesAlong(chess: Chess, from: Square, direction: [number, number]): PieceAt[] {
  const [file, rank] = coords(from);
  const found: PieceAt[] = [];
  for (let step = 1; found.length < 2; step++) {
    const square = squareAt(file + direction[0] * step, rank + direction[1] * step);
    if (!square) break;
    const piece = pieceOn(chess, square);
    if (piece) found.push(piece);
  }
  return found;
}

/** A piece lined up behind another on the same line, ready to take on the square after it. */
export interface Backer extends PieceAt {
  front: Square;
}

/** Pieces of `color` that stand behind an attacker of `square` on its line and would take next, like a queen behind a bishop. */
export function backers(chess: Chess, square: Square, color: Color): Backer[] {
  return chess.attackers(square, color).flatMap((from) => {
    const direction = directionTo(square, from);
    if (!direction) return [];
    const behind: Backer[] = [];
    let front = from;
    for (;;) {
      const [next] = piecesAlong(chess, front, direction);
      if (!next || next.color !== color || !slidesAlong(next.type, direction)) return behind;
      behind.push({ ...next, front });
      front = next.square;
    }
  });
}

/** The pin holding the piece on `square`: an enemy slider in front, a bigger piece of its own behind. */
export function pinOn(chess: Chess, square: Square): Pin | null {
  const pinned = pieceOn(chess, square);
  if (!pinned || pinned.type === 'k') return null;
  for (const [df, dr] of ALL_DIRECTIONS) {
    const [behind] = piecesAlong(chess, square, [df, dr]);
    const [pinner] = piecesAlong(chess, square, [-df, -dr]);
    if (!behind || !pinner || behind.color !== pinned.color || pinner.color === pinned.color) continue;
    if (!slidesAlong(pinner.type, [df, dr])) continue;
    if (isRealPin(chess, pinner, pinned, behind)) return { pinner, pinned, behind };
  }
  return null;
}

/** A pin only holds if losing the piece behind would cost more than the pinned piece is worth. */
function isRealPin(chess: Chess, pinner: PieceAt, pinned: PieceAt, behind: PieceAt): boolean {
  if (behind.type === 'k') return true;
  if (VALUE[behind.type] <= VALUE[pinned.type]) return false;
  const guarded = chess.attackers(behind.square, behind.color).length > 0;
  return !guarded || VALUE[behind.type] > VALUE[pinner.type];
}

/** The squares next to the king on the rank in front of it. */
export function frontSquares(king: Square, color: Color): Square[] {
  const [file, rank] = coords(king);
  const ahead = rank + (color === 'w' ? 1 : -1);
  return [file - 1, file, file + 1].flatMap((f) => squareAt(f, ahead) ?? []);
}

export function backRank(color: Color): string {
  return color === 'w' ? '1' : '8';
}

export function kingOf(chess: Chess, color: Color): PieceAt {
  return piecesOf(chess, color).find((p) => p.type === 'k')!;
}

export { otherColor, VALUE };
