import { Chess, type Color, type Move, type PieceSymbol, type Square } from 'chess.js';
import { attackedTargets, type Piece } from '../board/captions';
import { VALUE, captureGain, capturesOn, exchangeGain, isLoose, otherColor, passTurn, piecesOf, playLine, uciOf } from './board';
import type { Tactic } from './tactics';
import { capturedSquare, tradeOf, type Trade } from './trade';

/** What a wrong move costs in the line that punishes it. */
export interface Cost {
  /** From the opponent's side: `won` is what the user loses, `lost` what the user gets for it. */
  trade: Trade;
  /** The moves counted, from the opponent's reply. */
  counted: Move[];
  /** Later captures that add to the cost: of the piece the move put en prise, or by the piece that made the key capture. */
  then: Move[];
  /** The user's pieces the key capture's piece hits at once when the exchange is over. */
  forked: Piece[];
  /** The opponent keeps checking after the material is taken. */
  checks: boolean;
}

// A stored line that stops mid-exchange is played on for at most this many captures.
const MAX_SETTLE = 6;

/** Plays a line on from where it stops in the middle of an exchange, each side taking back while it gains. */
export function settled(fen: string, ucis: readonly string[]): string[] {
  const moves = playLine(fen, ucis);
  const last = moves.at(-1);
  if (!last?.captured) return moves.map(uciOf);
  const chess = new Chess(last.after);
  const extended = moves.map(uciOf);
  for (let i = 0; i < MAX_SETTLE && exchangeGain(chess, last.to) > 0; i++) {
    const capture = capturesOn(chess, last.to).reduce((a, b) => (VALUE[b.piece] < VALUE[a.piece] ? b : a));
    chess.move(capture);
    extended.push(uciOf(capture));
  }
  return extended;
}

/**
 * Where the user's own play in the line throws material away, so the line no longer shows what the wrong move
 * costs: a grab the key capture takes back at a loss, or a free quiet move that leaves the key target loose.
 * Returns the index of that user move, or -1.
 */
export function giveaway(t: Tactic): number {
  const { moves, key } = t;
  const grab = moves[key - 1];
  if (grab && grab.to === moves[key].to && isFreeGrab(moves, key - 1) && captureGain(grab) < 0) return key - 1;
  const squares = targetSquares(moves, key);
  for (let i = 1; i < key; i += 2) {
    const move = moves[i];
    if (move.captured || !isFree(move)) continue;
    if (!isLoose(move.before, squares[i]) && isLoose(move.after, squares[i + 1]) && safeWithout(moves, i, squares[i])) return i;
  }
  return -1;
}

/** The user's piece on `square` is out of danger when the line stops before move `i` and its exchange plays out. */
function safeWithout(moves: Move[], i: number, square: Square): boolean {
  const start = moves[0].before;
  const line = playLine(start, settled(start, moves.slice(0, i).map(uciOf)));
  const end = line.at(-1)!.after;
  const at = line.slice(i).reduce((on, m) => (m.from === on ? m.to : on), square);
  return new Chess(end).get(at)?.color === otherColor(moves[0].color) && !isLoose(end, at);
}

/** A capture that doesn't take back what was just taken, by a piece that wasn't in danger. */
function isFreeGrab(moves: Move[], i: number): boolean {
  const before = moves[i - 1];
  const takesBack = before?.captured && before.to === moves[i].to;
  return Boolean(moves[i].captured) && !takesBack && !isLoose(moves[i].before, moves[i].from);
}

/** A move made with nothing to answer: no check, no piece in danger, no mate threatened. */
function isFree(move: Move): boolean {
  const passed = passTurn(move.before);
  if (!passed) return false;
  const threats = new Chess(passed).moves({ verbose: true });
  return !threats.some((m) => m.san.endsWith('#') || (m.captured && captureGain(m) > 0));
}

/** Where the piece taken at `key` stood before each move of the line. */
function targetSquares(moves: Move[], key: number): Square[] {
  const squares: Square[] = [];
  let square = capturedSquare(moves[key]);
  squares[key] = square;
  for (let i = key - 1; i >= 0; i--) {
    if (moves[i].to === square && moves[i].color !== moves[key].color) square = moves[i].from;
    squares[i] = square;
  }
  return squares;
}

/**
 * What `move` costs in the tactic's line: the move, the opponent's play up to the key capture and the exchange
 * that follows it, a later recapture of the key piece, and later captures the move or the key piece lead to.
 * Grabs of pieces that were loose anyway, losing grabs and desperado moves after that don't count. `turnFen`
 * is the position the move was played from.
 */
export function costOf(turnFen: string, move: Move, t: Tactic): Cost {
  const end = exchangeEnd(turnFen, t.moves, t.key);
  const counted = [...t.moves.slice(0, end), ...delayedRecapture(t.moves, t.key, end)];
  const base = [move, ...counted];
  const candidates = new Set([laterCapture(t.moves, end, move.to), keyPieceCapture(t.moves, t.key, end)]);
  // A later capture counts only when it adds to the loss: taking back what the move itself took doesn't.
  const then = [...candidates]
    .filter((i) => i >= 0)
    .sort((a, b) => a - b)
    .filter((i) => netOf([...base, ...exchangeAt(t.moves, i)], t.side) > netOf(base, t.side));
  const all = [...base, ...then.flatMap((i) => exchangeAt(t.moves, i))];
  const named = new Set([t.moves[t.key], ...then.map((i) => t.moves[i])]);
  const trade = { ...tradeOf(all, t.side), ...piecesTaken(all, t.side, named) };
  const forked = t.id === 'free-piece' || t.id === 'material-win' ? forkedAfter(t, end) : [];
  return { trade, counted, then: then.map((i) => t.moves[i]), forked, checks: keepsChecking(t) };
}

function netOf(moves: Move[], side: Color): number {
  return tradeOf(moves, side).net;
}

/**
 * The pieces each side takes over `moves`, less alike ones that cancel out: a recapture, two taken on one square,
 * one taken by the first move, and two taken anywhere unless the text names either (`named`).
 */
function piecesTaken(moves: Move[], side: Color, named: Set<Move>): Pick<Trade, 'won' | 'lost'> {
  const captures = capturesIn(moves, side, named);
  for (let i = captures.length - 1; i > 0; i--) {
    const [a, b] = [captures[i - 1], captures[i]];
    if (!a.gone && !b.gone && a.square === b.square && pairs(a, b)) a.gone = b.gone = true;
  }
  const rules = [
    (a: Taken, b: Taken) => a.square === b.square,
    (a: Taken, b: Taken) => a.first || b.first,
    (a: Taken, b: Taken) => a.type === b.type && !a.named && !b.named,
  ];
  for (const rule of rules) {
    for (const a of captures.filter((c) => !c.gone)) {
      const b = !a.gone && captures.find((c) => !c.gone && pairs(a, c) && rule(a, c));
      if (b) a.gone = b.gone = true;
    }
  }
  const kept = (mine: boolean) => captures.filter((c) => !c.gone && c.mine === mine).map((c) => c.type);
  const byValue = (types: PieceSymbol[]) => types.sort((a, b) => VALUE[b] - VALUE[a]);
  return { won: byValue(kept(true)), lost: byValue(kept(false)) };
}

interface Taken {
  square: Square;
  type: PieceSymbol;
  mine: boolean;
  /** Taken by the line's first move. */
  first: boolean;
  named: boolean;
  gone: boolean;
}

/** The captures in a line; a promoted piece taken back counts as a pawn. */
function capturesIn(moves: Move[], side: Color, named: Set<Move>): Taken[] {
  const promoted = new Set<Square>();
  return moves.flatMap((move, i) => {
    const square = capturedSquare(move);
    const type = move.captured && promoted.delete(square) ? 'p' : move.captured;
    if (promoted.delete(move.from)) promoted.add(move.to);
    if (move.promotion) promoted.add(move.to);
    return type ? [{ square, type, mine: move.color === side, first: i === 0, named: named.has(move), gone: false }] : [];
  });
}

/** Captures by opposite sides of alike pieces, a knight and a bishop being alike. */
function pairs(a: Taken, b: Taken): boolean {
  const minor = (type: PieceSymbol) => type === 'n' || type === 'b';
  return a.mine !== b.mine && (a.type === b.type || (minor(a.type) && minor(b.type)));
}

/** The key capture comes with check and the opponent checks again later: the attack goes on. */
function keepsChecking(t: Tactic): boolean {
  const checks = (m: Move) => m.color === t.side && m.san.includes('+');
  return checks(t.moves[t.key]) && t.moves.slice(t.key + 1).some(checks);
}

/** Past the key capture: the captures that take back on its square, and those that win back what is behind. */
function exchangeEnd(turnFen: string, moves: Move[], key: number): number {
  const side = moves[key].color;
  let balance = 0;
  const value = (m: Move) => (m.captured ? VALUE[m.captured] : 0) * (m.color === side ? 1 : -1);
  for (let i = 0; i <= key; i++) balance += value(moves[i]);
  let i = key + 1;
  for (; moves[i]?.captured; i++) {
    const move = moves[i];
    const takesBack = move.to === moves[i - 1].to;
    const behind = move.color === side ? balance < 0 : balance > 0;
    const freeAnyway = move.color !== side && wasLoose(turnFen, capturedSquare(move), side);
    if (!takesBack && (!behind || freeAnyway || captureGain(move) < 0)) break;
    balance += value(move);
  }
  return i;
}

/** The user taking back the key capture's piece later, with nothing taken in between, while it still stands there. */
function delayedRecapture(moves: Move[], key: number, end: number): Move[] {
  const square = moves[key].to;
  for (let i = end; i < moves.length; i++) {
    if (moves[i].from === square || (moves[i].captured && moves[i].to !== square)) return [];
    if (moves[i].captured) return moves[i].color === moves[key].color ? [] : exchangeAt(moves, i);
  }
  return [];
}

/** The capture at `i` with the captures that take back on its square right after it. */
function exchangeAt(moves: Move[], i: number): Move[] {
  let j = i + 1;
  while (moves[j]?.captured && moves[j].to === moves[i].to) j++;
  return moves.slice(i, j);
}

/** The opponent's capture on `square` after `from`, while the user's piece the move put there still stands on it. */
function laterCapture(moves: Move[], from: number, square: Square): number {
  const side = moves[0].color;
  for (let i = 0; i < moves.length; i++) {
    if (moves[i].color !== side && moves[i].from === square) return -1;
    if (moves[i].to === square && moves[i].captured) return i >= from && moves[i].color === side ? i : -1;
  }
  return -1;
}

/** The key capture's piece taking a piece again with its next move, before the user has taken anything. */
function keyPieceCapture(moves: Move[], key: number, end: number): number {
  const square = moves[key].to;
  for (let i = end; i < moves.length; i++) {
    const move = moves[i];
    if (move.color !== moves[key].color) {
      if (move.captured || move.to === square) return -1;
    } else if (move.from === square) {
      return move.captured && move.captured !== 'p' ? i : -1;
    }
  }
  return -1;
}

/** The user's king or bigger pieces the key capture's piece hits at once once the exchange is over. */
function forkedAfter(t: Tactic, end: number): Piece[] {
  const capture = t.moves[t.key];
  const fen = t.moves[end - 1].after;
  const chess = new Chess(fen);
  const piece = chess.get(capture.to);
  if (piece?.color !== t.side || isLoose(fen, capture.to)) return [];
  const targets = attackedTargets(chess, capture.to, piece.type, t.side);
  return targets.length >= 2 ? targets : [];
}

/**
 * The opponent's best capture of a user piece, not a pawn, left loose by `move`: cheap to make, not answered by
 * mate, and not paid back at once by a capture of the user's.
 */
export function hangingAfter(move: Move): Move | null {
  const chess = new Chess(move.after);
  const captures = piecesOf(chess, move.color)
    .filter((p) => p.type !== 'p' && p.type !== 'k')
    .flatMap((p) => capturesOn(chess, p.square))
    .filter((m) => isCheap(chess, m) && captureGain(m) > 0 && !mateAfter(m) && !paidBack(m));
  return captures.reduce<Move | null>((best, m) => (!best || captureGain(m) > captureGain(best) ? m : best), null);
}

/** After `capture`, the other side wins back at least as much with a capture of its own. */
function paidBack(capture: Move): boolean {
  const replies = new Chess(capture.after).moves({ verbose: true });
  return replies.some((m) => m.captured && captureGain(m) >= captureGain(capture));
}

/** Taking `capture` costs nothing back right away: the target is undefended or worth more than the taker. */
function isCheap(chess: Chess, capture: Move): boolean {
  const defended = chess.attackers(capture.to, otherColor(capture.color)).length > 0;
  return !defended || VALUE[capture.piece] < VALUE[capture.captured!];
}

/** The mate in one that answers `move`, if any. */
export function mateAfter(move: Move): Move | null {
  const chess = new Chess(move.after);
  const mate = chess.moves().find((san) => san.endsWith('#'));
  return mate ? chess.move(mate) : null;
}

/** Whether the opponent could already make the same capture, at a gain, in the turn's position. */
export function couldTakeBefore(fen: string, capture: Move): boolean {
  const passed = passTurn(fen);
  if (!passed) return false;
  const [same] = playLine(passed, [uciOf(capture)]);
  return Boolean(same?.captured) && same.captured === capture.captured && captureGain(same) > 0;
}

/** Whether `side`'s opponent could already win the piece on `square` in `fen`: it belongs to `side` and stood loose. */
export function wasLoose(fen: string, square: Square, side: Color): boolean {
  const piece = new Chess(fen).get(square);
  return piece?.color === side && isLoose(fen, square);
}
