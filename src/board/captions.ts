import { Chess, type Color, type Move, type PieceSymbol, type Square } from 'chess.js';
import type { Side } from '../content/types';
import { parseUci } from '../game/position';

interface Piece {
  square: Square;
  type: PieceSymbol;
}

const VALUE: Record<PieceSymbol, number> = { p: 1, n: 3, b: 3, r: 5, q: 9, k: Infinity };
const NAME: Record<PieceSymbol, string> = {
  p: 'pawn',
  n: 'knight',
  b: 'bishop',
  r: 'rook',
  q: 'queen',
  k: 'king',
};
const COUNT_WORD = ['', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight'];

const DIAGONALS = [
  [1, 1],
  [1, -1],
  [-1, 1],
  [-1, -1],
];
const STRAIGHTS = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];
const SLIDER_DIRECTIONS: Partial<Record<PieceSymbol, number[][]>> = {
  b: DIAGONALS,
  r: STRAIGHTS,
  q: [...DIAGONALS, ...STRAIGHTS],
};

const otherColor = (color: Color): Color => (color === 'w' ? 'b' : 'w');

function squareAt(file: number, rank: number): Square | null {
  if (file < 0 || file > 7 || rank < 0 || rank > 7) return null;
  return `${'abcdefgh'[file]}${rank + 1}` as Square;
}

function piecesOf(chess: Chess, color: Color): Piece[] {
  return chess
    .board()
    .flat()
    .flatMap((p) => (p && p.color === color ? [{ square: p.square, type: p.type }] : []));
}

function attackedBy(chess: Chess, attacker: Square, color: Color): Piece[] {
  return piecesOf(chess, otherColor(color)).filter((t) => chess.attackers(t.square, color).includes(attacker));
}

/** Enemy pieces worth the attention of a piece of type `mover`: the king, bigger pieces and loose pieces. */
function attackedTargets(chess: Chess, attacker: Square, mover: PieceSymbol, color: Color): Piece[] {
  return attackedBy(chess, attacker, color).filter((t) => {
    if (t.type === 'p') return false;
    return t.type === 'k' || VALUE[t.type] > VALUE[mover] || chess.attackers(t.square, otherColor(color)).length === 0;
  });
}

/** An enemy piece the slider at `from` pins against a more valuable piece behind it. */
function findPin(chess: Chess, from: Square, type: PieceSymbol, color: Color): { pinned: Piece; behind: Piece } | null {
  const file = from.charCodeAt(0) - 97;
  const rank = Number(from[1]) - 1;
  for (const [df, dr] of SLIDER_DIRECTIONS[type] ?? []) {
    const hits: Piece[] = [];
    for (let step = 1; hits.length < 2; step++) {
      const square = squareAt(file + df * step, rank + dr * step);
      if (!square) break;
      const piece = chess.get(square);
      if (!piece) continue;
      if (piece.color === color) break;
      hits.push({ square, type: piece.type });
    }
    const [pinned, behind] = hits;
    if (behind && pinned.type !== 'k' && VALUE[behind.type] > VALUE[pinned.type]) return { pinned, behind };
  }
  return null;
}

function listNames(types: PieceSymbol[]): string {
  const counts = new Map<PieceSymbol, number>();
  for (const type of [...types].sort((a, b) => VALUE[b] - VALUE[a])) counts.set(type, (counts.get(type) ?? 0) + 1);
  const names = [...counts].map(([type, n]) => (n === 1 ? NAME[type] : `${COUNT_WORD[n]} ${NAME[type]}s`));
  if (names.length === 1) return names[0];
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

function describeCapture(move: Move, mine: boolean): string {
  if (!move.captured) return '';
  return mine ? `you take the ${NAME[move.captured]}` : `takes your ${NAME[move.captured]}`;
}

interface Tactic {
  text: string;
  includesKing: boolean;
}

function describeTactic(before: Chess, after: Chess, move: Move, mine: boolean): Tactic | null {
  const type = after.get(move.to)?.type;
  if (!type || type === 'k') return null;
  const their = mine ? 'the' : 'your';

  const targets = attackedTargets(after, move.to, type, move.color);
  if (targets.length >= 2) {
    const includesKing = targets.some((t) => t.type === 'k');
    return { text: `forks ${their} ${listNames(targets.map((t) => t.type))}`, includesKing };
  }

  const pin = findPin(after, move.to, type, move.color);
  if (pin) return { text: `pins ${their} ${NAME[pin.pinned.type]} to ${their} ${NAME[pin.behind.type]}`, includesKing: false };

  const alreadyAttacked = new Set(attackedBy(before, move.from, move.color).map((t) => t.square));
  const fresh = targets.filter((t) => t.type !== 'k' && !alreadyAttacked.has(t.square));
  if (fresh.length === 1) return { text: `attacks ${their} ${NAME[fresh[0].type]}`, includesKing: false };
  return null;
}

/** One short plain-English caption for a move, from the user's point of view; empty for quiet moves. */
export function captionFor(fenBefore: string, uci: string, userSide: Side): string {
  const before = new Chess(fenBefore);
  const after = new Chess(fenBefore);
  let move: Move;
  try {
    move = after.move(parseUci(uci));
  } catch {
    return '';
  }
  const mine = move.color === userSide;
  const mate = after.isCheckmate();
  const tactic = mate ? null : describeTactic(before, after, move, mine);
  const check = after.isCheck() && !tactic?.includesKing;

  return [
    describeCapture(move, mine),
    move.promotion ? `promotes to a ${NAME[move.promotion]}` : '',
    move.isKingsideCastle() || move.isQueensideCastle() ? 'castles' : '',
    mate ? 'checkmate' : check ? 'check' : '',
    tactic?.text ?? '',
  ]
    .filter(Boolean)
    .join(', ');
}
