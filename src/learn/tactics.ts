import { Chess, type Color, type Move, type Square } from 'chess.js';
import { attackedTargets } from '../board/captions';
import {
  VALUE,
  backRank,
  captureGain,
  capturesOn,
  directionTo,
  exchangeGain,
  frontSquares,
  isBetween,
  isLoose,
  kingOf,
  otherColor,
  passTurn,
  pieceOn,
  piecesAlong,
  piecesOf,
  pinOn,
  playLine,
  slidesAlong,
  type PieceAt,
  type Pin,
} from './board';
import { capturedSquare, tradeOf, type Trade } from './trade';

export type TacticId =
  | 'checkmate'
  | 'fork'
  | 'skewer'
  | 'discovered-attack'
  | 'pin'
  | 'trapped-piece'
  | 'remove-defender'
  | 'mate-threat'
  | 'free-piece'
  | 'material-win';

interface LineFacts {
  /** The line, starting with a move by `side`. */
  moves: Move[];
  side: Color;
  trade: Trade;
  /** Index of the capture that wins the main piece, or of the mate. */
  key: number;
  /** Index of the move that makes the tactic; earlier moves of the line set it up. */
  at: number;
  /** The piece taken at `key`, where it stood when the tactic was played. */
  won: PieceAt | null;
}

/** The pattern found, with the pieces that play a part in it. */
type Pattern =
  | { id: 'checkmate'; backRank: boolean; boxedByPawns: boolean }
  | { id: 'fork'; forker: PieceAt; targets: PieceAt[] }
  | { id: 'skewer'; attacker: PieceAt; front: PieceAt; back: PieceAt }
  | { id: 'discovered-attack'; mover: PieceAt; slider: PieceAt; target: PieceAt }
  | { id: 'pin'; pin: Pin; how: 'created' | 'attacked' | 'defender' | 'exposed' }
  | { id: 'trapped-piece'; trapped: PieceAt; attacker: PieceAt; escapes: number }
  | { id: 'remove-defender'; defender: PieceAt; guarded: PieceAt; how: 'capture' | 'chase' | 'deflect' }
  | { id: 'mate-threat'; mate: Move }
  | { id: 'free-piece'; reason: 'undefended' | 'cheaper' | 'outnumbered' }
  | { id: 'material-win' };

export type Tactic = LineFacts & Pattern;

interface Context {
  moves: Move[];
  side: Color;
  key: number;
  /** Square of the piece won at `key`, in the position before each move up to `key`. */
  targetSquares: Square[];
}

type Detector = (ctx: Context, t: number) => Pattern | null;

/**
 * How `side` wins in a line that starts with its move from `fen`; null when the line wins nothing.
 * `prior` are moves played just before (such as a bait), counted in the trade but not searched for tactics.
 */
export function tacticIn(fen: string, ucis: readonly string[], side: Color, prior: Move[] = []): Tactic | null {
  const moves = playLine(fen, ucis);
  if (!moves.length || moves[0].color !== side) return null;
  const trade = tradeAfter(prior, moves, side);
  const facts = { moves, side, trade };

  const mate = moves.findIndex((m) => m.color === side && m.san.endsWith('#'));
  if (mate >= 0) return { id: 'checkmate', ...backRankMate(moves[mate]), ...facts, key: mate, at: 0, won: null };
  if (trade.net <= 0) return null;

  for (const [rank, key] of trade.gains.entries()) {
    const ctx: Context = { moves, side, key, targetSquares: targetSquares(moves, key) };
    for (let t = 0; t <= key; t += 2) {
      for (const detect of DETECTORS) {
        const found = detect(ctx, t);
        if (found) return { ...found, ...facts, key, at: t, won: wonAt(ctx, t) };
      }
    }
    // The biggest gain may come from the fallout of a double attack rather than from the attacked piece.
    const fallout = rank === 0 ? (forkWithoutCapture(moves, side) ?? discoveryWithoutCapture(moves, side)) : null;
    if (fallout) return { ...fallout, ...facts, key, at: 0, won: wonAt(ctx, 0) };
  }

  const key = trade.gains[0] ?? moves.findIndex((m) => m.color === side && m.promotion);
  const won = trade.gains.length ? wonAt({ moves, side, key, targetSquares: targetSquares(moves, key) }, 0) : null;
  return { id: 'material-win', ...facts, key, at: 0, won };
}

/** The trade over `prior` and `moves` together, with gains indexed into `moves`. */
function tradeAfter(prior: Move[], moves: Move[], side: Color): Trade {
  const trade = tradeOf([...prior, ...moves], side);
  return { ...trade, gains: trade.gains.map((i) => i - prior.length).filter((i) => i >= 0) };
}

/** Whether the piece won at `key` is taken on the square it stood on when the tactic was played. */
export function wonInPlace(tactic: Tactic): boolean {
  return tactic.won !== null && capturedSquare(tactic.moves[tactic.key]) === tactic.won.square;
}

function wonAt({ moves, targetSquares }: Context, t: number): PieceAt | null {
  return pieceOn(new Chess(moves[t].before), targetSquares[t]);
}

/** Follows the piece taken at `key` back through the line to where it stood before each move. */
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

/** A mate on the king's back rank, with the squares in front of it blocked by its own pieces. */
function backRankMate(mate: Move): { backRank: boolean; boxedByPawns: boolean } {
  const chess = new Chess(mate.after);
  const king = kingOf(chess, chess.turn());
  const front = frontSquares(king.square, king.color).map((s) => chess.get(s));
  const onBackRank = king.square[1] === backRank(king.color) && mate.to[1] === backRank(king.color);
  const boxed = front.every((p) => p?.color === king.color) && front.some((p) => p?.type === 'p');
  return { backRank: onBackRank && boxed, boxedByPawns: front.every((p) => p?.type === 'p') };
}

function forkTargets(move: Move, side: Color): { forker: PieceAt; targets: PieceAt[] } {
  const after = new Chess(move.after);
  const forker = pieceOn(after, move.to)!;
  const targets = attackedTargets(after, move.to, forker.type, side).map((p) => ({ ...p, color: otherColor(side) }));
  return { forker, targets };
}

/** A forking piece that is simply taken doesn't win anything, unless taking it back wins more. */
function forkerSurvives(moves: Move[], t: number): boolean {
  const [move, reply, next] = moves.slice(t, t + 3);
  if (!reply || reply.to !== move.to) return true;
  return next?.to === move.to && Boolean(next.captured) && VALUE[next.captured!] > VALUE[move.promotion ?? move.piece];
}

const fork: Detector = ({ moves, side, key, targetSquares }, t) => {
  if (t >= key || !forkerSurvives(moves, t)) return null;
  const { forker, targets } = forkTargets(moves[t], side);
  if (targets.length < 2 || !targets.some((p) => p.square === targetSquares[t + 1])) return null;
  return { id: 'fork', forker, targets };
};

/** A first move that hits the king and a bigger piece (or two bigger pieces), when the win comes from the fallout. */
function forkWithoutCapture(moves: Move[], side: Color): Pattern | null {
  if (!forkerSurvives(moves, 0)) return null;
  const { forker, targets } = forkTargets(moves[0], side);
  const heavy = targets.filter((p) => p.type === 'k' || VALUE[p.type] > VALUE[forker.type]);
  return heavy.length >= 2 ? { id: 'fork', forker, targets: heavy } : null;
}

// Room for one exchange elsewhere before the piece behind is taken.
const SKEWER_DELAY = 4;

const skewer: Detector = ({ moves, key, targetSquares }, t) => {
  const move = moves[t];
  const capture = moves[key];
  if (key <= t || key > t + SKEWER_DELAY || capture.from !== move.to) return null;
  if (moves.slice(t + 1, key).some((m) => m.from === move.to || m.to === move.to)) return null;
  const after = new Chess(move.after);
  const attacker = pieceOn(after, move.to)!;
  const direction = directionTo(move.to, targetSquares[t + 1]);
  if (!direction || !slidesAlong(attacker.type, direction)) return null;
  const [front, back] = piecesAlong(after, move.to, direction);
  if (!front || !back || front.color === attacker.color || back.color === attacker.color) return null;
  if (back.square !== targetSquares[t + 1] || targetSquares[key] !== back.square) return null;
  if (!moves.slice(t + 1, key).some((m) => m.from === front.square)) return null;
  if (front.type !== 'k' && VALUE[front.type] <= VALUE[back.type]) return null;
  return { id: 'skewer', attacker, front, back };
};

/** Enemy pieces a slider starts to attack because `move` stepped off the line between them. */
function uncovered(move: Move, side: Color): { slider: PieceAt; target: PieceAt }[] {
  const before = new Chess(move.before);
  const after = new Chess(move.after);
  return piecesOf(after, otherColor(side)).flatMap((target) =>
    after.attackers(target.square, side).flatMap((square) => {
      const fresh = square !== move.to && !before.attackers(target.square, side).includes(square);
      return fresh && isBetween(square, move.from, target.square) ? [{ slider: pieceOn(after, square)!, target }] : [];
    }),
  );
}

const discovered: Detector = ({ moves, side, key, targetSquares }, t) => {
  const move = moves[t];
  const mover = pieceOn(new Chess(move.after), move.to)!;
  const capture = moves[key];
  const reply = moves[t + 1];
  const start = new Chess(moves[0].before);
  for (const { slider, target } of uncovered(move, side)) {
    // A line that was already open at the start was only blocked by the line's own moves.
    if (start.attackers(target.square, side).includes(slider.square)) continue;
    if (target.type !== 'k' && !worthAttacking(move.after, slider, target)) continue;
    const checkWins = target.type === 'k' && (t === key || capture.from === move.to) && reply && reply.to !== move.to;
    const sliderWins = onlyChecksBetween(moves, t, key) && target.square === targetSquares[t + 1] && capture.from === slider.square;
    // The move takes something itself, and the new attack stops the recapture.
    const doubleThreat = t === key && target.type !== 'k' && reply && reply.to !== move.to && captureGain(move) <= 0;
    if (checkWins || sliderWins || doubleThreat) return { id: 'discovered-attack', mover, slider, target };
  }
  return null;
};

/** Whether every move of the tactic's side between `t` and `key` is a check, so nothing else could intervene. */
function onlyChecksBetween(moves: Move[], t: number, key: number): boolean {
  if (key <= t) return false;
  return moves.slice(t + 2, key).every((m, i) => i % 2 === 1 || m.san.includes('+'));
}

/** A new attack only threatens something if the target can't just trade itself off or is left loose. */
function worthAttacking(fen: string, attacker: PieceAt, target: PieceAt): boolean {
  if (target.type === 'p') return false;
  return VALUE[target.type] > VALUE[attacker.type] || isLoose(fen, target.square);
}

/** A first move that uncovers an attack on the king or on a piece bigger than the attacker. */
function discoveryWithoutCapture(moves: Move[], side: Color): Pattern | null {
  const move = moves[0];
  const found = uncovered(move, side).find(
    ({ slider, target }) => target.type === 'k' || (target.type !== 'p' && VALUE[target.type] > VALUE[slider.type]),
  );
  const mover = pieceOn(new Chess(move.after), move.to)!;
  return found ? { id: 'discovered-attack', mover, ...found } : null;
}

/** A capture whose guards are all pinned, so taking back costs more: the capture wins, or the piece behind falls. */
const pinnedGuard: Detector = ({ moves, side, key, targetSquares }, t) => {
  const guard = t === key || t === 0 ? guardPin(moves[t], side) : null;
  if (!guard || (t !== key && guard.behind.square !== targetSquares[key])) return null;
  return { id: 'pin', pin: guard, how: 'defender' };
};

/** The pin on the guards of a captured piece, when every guard is pinned to its king or to something bigger. */
function guardPin(move: Move, side: Color): Pin | null {
  if (!move.captured) return null;
  const after = new Chess(move.after);
  const guards = after.attackers(move.to, otherColor(side));
  const pins = guards.map((square) => pinOn(after, square));
  // A guard "pinned" by the capturing piece itself just takes it.
  if (!pins.length || !pins.every((p) => p && p.pinner.color === side && p.pinner.square !== move.to)) return null;
  const mover = VALUE[move.promotion ?? move.piece];
  const holds = pins.every((p) => p!.behind.type === 'k' || VALUE[p!.behind.type] > mover);
  const free = !capturesOn(after, move.to).some((m) => !pins.some((p) => p!.pinned.square === m.from));
  return holds && free ? pins[0] : null;
}

/** A pinned piece that steps away, letting the pinner take the bigger piece behind it at `key`. */
const exposedPin: Detector = ({ moves, key, targetSquares }, t) => {
  const capture = moves[key];
  if (t >= key || moves.slice(t, key).some((m) => m.to === capture.from || m.from === capture.from)) return null;
  const after = new Chess(moves[t].after);
  const behind = targetSquares[t + 1];
  const direction = directionTo(capture.from, behind);
  if (!direction) return null;
  const [pinned, rear] = piecesAlong(after, capture.from, direction);
  if (!pinned || rear?.square !== behind || pinned.color === capture.color) return null;
  const pin = pinOn(after, pinned.square);
  const leaves = moves.slice(t + 1, key).some((m) => m.from === pinned.square);
  return pin?.pinner.square === capture.from && leaves ? { id: 'pin', pin, how: 'exposed' } : null;
};

/** The piece won is pinned: by this move, or already and now attacked again. */
const pinnedTarget: Detector = ({ moves, side, key, targetSquares }, t) => {
  if (t >= key) return null;
  const move = moves[t];
  const square = targetSquares[t + 1];
  const after = new Chess(move.after);
  const found = pinOn(after, square);
  if (!found || found.pinner.color !== side || found.pinned.type === 'p') return null;
  // The pinned piece may only leave by taking the pinner, and must then be taken back at once.
  const escape = moves.slice(t + 1, key).find((m) => m.from === square);
  if (escape && (escape.to !== found.pinner.square || moves.indexOf(escape) + 1 !== key)) return null;
  if (found.pinner.square === move.to) return { id: 'pin', pin: found, how: 'created' };
  const wasPinned = pinOn(new Chess(move.before), square)?.pinner.square === found.pinner.square;
  const attacks = after.attackers(square, side).includes(move.to);
  return wasPinned && attacks ? { id: 'pin', pin: found, how: 'attacked' } : null;
};

const trapped: Detector = ({ moves, side, key, targetSquares }, t) => {
  if (t >= key) return null;
  const move = moves[t];
  const square = targetSquares[t + 1];
  const after = new Chess(move.after);
  const piece = pieceOn(after, square);
  if (!piece || piece.type === 'p' || piece.type === 'k' || after.inCheck()) return null;
  if (exchangeGain(new Chess(move.before), square) > 0) return null;
  const probe = passTurn(move.after);
  if (!probe || exchangeGain(new Chess(probe), square) === 0) return null;
  const escapes = after.moves({ square, verbose: true });
  if (!escapes.every(escapeFails)) return null;
  const attacker = after.attackers(square, side).includes(move.to)
    ? pieceOn(after, move.to)!
    : cheapestAttacker(after, square, side);
  return { id: 'trapped-piece', trapped: piece, attacker, escapes: escapes.length };
};

/** An escape fails when the piece can still be won on its new square. */
function escapeFails(escape: Move): boolean {
  const taken = escape.captured ? VALUE[escape.captured] : 0;
  return exchangeGain(new Chess(escape.after), escape.to) - taken > 0;
}

function cheapestAttacker(chess: Chess, square: Square, side: Color): PieceAt {
  const attackers = chess.attackers(square, side).map((s) => pieceOn(chess, s)!);
  return attackers.reduce((a, b) => (VALUE[b.type] < VALUE[a.type] ? b : a));
}

const removeDefender: Detector = ({ moves, side, key, targetSquares }, t) => {
  if (t >= key) return null;
  const square = targetSquares[t];
  if (targetSquares[key] !== square) return null;
  const move = moves[t];
  const reply = moves[t + 1];
  const before = new Chess(move.before);
  // The piece must already be under attack and held only by its guards.
  if (!before.attackers(square, side).length) return null;
  if (exchangeGain(before, square) > 0 || captureGain(moves[key]) <= 0) return null;
  const guardsAtKey = new Chess(moves[key].before).attackers(square, otherColor(side));
  const guarded = pieceOn(before, square)!;
  const guards = before.attackers(square, otherColor(side));
  const taken = guards.find((from) => move.to === from);
  if (taken) return { id: 'remove-defender', defender: pieceOn(before, taken)!, guarded, how: 'capture' };
  const moved = guards.find((from) => reply?.from === from);
  if (!moved) return null;
  // The guard must really be gone: not guarding from its new square, then or when the piece is taken.
  const stillGuards = (fen: string) => new Chess(fen).attackers(square, otherColor(side)).includes(reply.to);
  if (stillGuards(reply.after) || guardsAtKey.includes(reply.to)) return null;
  const how = reply.to === move.to ? 'deflect' : 'chase';
  if (how === 'chase' && !new Chess(move.after).attackers(moved, side).includes(move.to)) return null;
  return { id: 'remove-defender', defender: pieceOn(before, moved)!, guarded, how };
};

const mateThreat: Detector = ({ moves, key }, t) => {
  const move = moves[t];
  if (t >= key || move.san.includes('+')) return null;
  const probe = passTurn(move.after);
  if (!probe) return null;
  const mate = new Chess(probe).moves({ verbose: true }).find((m) => m.san.endsWith('#'));
  return mate ? { id: 'mate-threat', mate } : null;
};

const freePiece: Detector = ({ moves, side, key }, t) => {
  if (t !== 0 || key !== 0) return null;
  const move = moves[0];
  if (!move.captured || captureGain(move) <= 0) return null;
  const guards = new Chess(move.before).attackers(move.to, otherColor(side));
  const reason = guards.length === 0 ? 'undefended' : VALUE[move.piece] < VALUE[move.captured] ? 'cheaper' : 'outnumbered';
  return { id: 'free-piece', reason };
};

const DETECTORS: Detector[] = [
  discovered,
  fork,
  skewer,
  pinnedGuard,
  exposedPin,
  pinnedTarget,
  trapped,
  removeDefender,
  mateThreat,
  freePiece,
];
