// What a single move does, in a few words: why a tempting move appeals, how a defence works, what a safe move offers.
import { Chess, SQUARES, type Color, type Move, type PieceSymbol, type Square } from 'chess.js';
import { NAME, attackedTargets } from '../board/captions';
import { backRank, captureGain, directionTo, isBetween, isLoose, kingOf, otherColor, pieceOn, piecesOf, slidesAlong, type PieceAt } from './board';
import type { Tactic } from './tactics';
import { listOf, refer } from './words';

const bare = (san: string) => san.replace(/[+#]$/, '');

/** "the knight", or "a pawn". */
export function takenText(type: PieceSymbol): string {
  return type === 'p' ? 'a pawn' : `the ${NAME[type]}`;
}

/** "the d-file", "the 7th rank", "the diagonal": the line through two squares. */
export function lineThrough(a: Square, b: Square): string {
  if (a[0] === b[0]) return `the ${a[0]}-file`;
  if (a[1] !== b[1]) return 'the diagonal';
  const rank = Number(a[1]);
  return `the ${rank}${['st', 'nd', 'rd'][rank - 1] ?? 'th'} rank`;
}

const isCastle = (move: Move) => move.isKingsideCastle() || move.isQueensideCastle();

/** A knight or bishop leaving its back rank. */
function develops(move: Move): boolean {
  return 'nb'.includes(move.piece) && move.from[1] === backRank(move.color) && move.to[1] !== backRank(move.color);
}

/** The enemy pieces the moved piece now hits: those worth hitting (bigger or loose), else any piece but a pawn or the king. */
function newTargets(move: Move): PieceAt[] {
  const after = new Chess(move.after);
  const enemy = otherColor(move.color);
  const worth = attackedTargets(after, move.to, move.promotion ?? move.piece, move.color).filter((p) => p.type !== 'k');
  const hit = worth.length
    ? worth
    : piecesOf(after, enemy).filter((p) => !'pk'.includes(p.type) && after.attackers(p.square, move.color).includes(move.to));
  return hit.map((p) => ({ ...p, color: enemy }));
}

/** A pawn step beside the king that gives it a square to breathe. */
function makesLuft(move: Move): boolean {
  if (move.piece !== 'p') return false;
  const king = kingOf(new Chess(move.before), move.color).square;
  const near = (a: Square, b: Square) => Math.abs(a.charCodeAt(0) - b.charCodeAt(0)) <= 1 && Math.abs(Number(a[1]) - Number(b[1])) <= 1;
  return near(move.from, king) && move.from[1] !== king[1];
}

/** The plain facts of a move: castling, a capture, a check, the pieces it attacks. */
function facts(move: Move, user: Color, castles: string): string[] {
  const reasons: string[] = [];
  if (isCastle(move)) reasons.push(castles);
  if (move.captured) reasons.push(`takes ${takenText(move.captured)}`);
  if (move.san.includes('+')) reasons.push('gives check');
  const hits = newTargets(move);
  if (hits.length) reasons.push(`attacks ${listOf(hits.map((p) => refer(p, user)))}`);
  return reasons;
}

/** What makes a move tempting, as clauses after "it": "takes a pawn", "gives check", "attacks the queen on e5". */
export function appeal(move: Move, user: Color): string[] {
  const reasons = facts(move, user, 'castles your king');
  if (reasons.length) return reasons;
  if (develops(move)) return [`develops your ${NAME[move.piece]}`];
  return escapes(move) ? [`moves your ${NAME[move.piece]} out of danger`] : [];
}

/** A piece other than the king that could be won where it stood, and the move takes it away. */
function escapes(move: Move): boolean {
  return move.piece !== 'k' && isLoose(move.before, move.from);
}

/** Counting on the square says the capture wins, whatever else it allows. */
export function looksFree(move: Move): boolean {
  return Boolean(move.captured) && captureGain(move) > 0;
}

/** A file with no pawns on it. */
function openFile(fen: string, file: string): boolean {
  const board = new Chess(fen);
  return [1, 2, 3, 4, 5, 6, 7, 8].every((rank) => board.get(`${file}${rank}` as Square)?.type !== 'p');
}

/** No piece of `color` can be won once the move is played. */
function nothingLoose(fen: string, color: Color): boolean {
  return piecesOf(new Chess(fen), color).every((p) => p.type === 'k' || !isLoose(fen, p.square));
}

/** What a safe move does for the user, as clauses after its SAN: "takes the bishop", "puts your rook on the open d-file". */
export function purpose(move: Move, user: Color): string[] {
  const reasons = facts(move, user, 'gets your king to safety');
  if (reasons.length) return reasons;
  if (develops(move)) return [`develops your ${NAME[move.piece]}`];
  if (makesLuft(move)) return ['gives your king a square to escape to'];
  if (escapes(move) && !isLoose(move.after, move.to)) return [`takes your ${NAME[move.piece]} out of danger`];
  if (move.piece === 'r' && move.from[0] !== move.to[0] && openFile(move.after, move.to[0])) {
    return [`puts your rook on the open ${move.to[0]}-file`];
  }
  return nothingLoose(move.after, user) ? ['leaves nothing of yours hanging'] : [];
}

/** How a move answers a threat, and the enemy piece it works against. */
export interface Answer {
  text: string;
  against?: PieceAt;
}

/** The enemy slider whose line to `target` the move closes, its only other blockers being the user's own pieces. */
function blockedLine(before: Chess, move: Move, target: Square): PieceAt | null {
  for (const slider of piecesOf(before, otherColor(move.color))) {
    const direction = directionTo(slider.square, target);
    if (!direction || !slidesAlong(slider.type, direction) || !isBetween(slider.square, move.to, target)) continue;
    const between = SQUARES.filter((s) => isBetween(slider.square, s, target) && s !== move.from);
    if (between.every((s) => !before.get(s) || before.get(s)!.color === move.color)) return slider;
  }
  return null;
}

/** The squares a threat is about: where its moves land, what it would win, and the user's king. */
function threatSquares(t: Tactic, user: Color, fen: string): Square[] {
  const squares = [t.moves[0].to, t.moves[t.key]?.to, t.won?.square, kingOf(new Chess(fen), user).square];
  return [...new Set(squares.filter((s): s is Square => Boolean(s)))];
}

/** The enemy piece that makes the winning capture, when it stands on its square already. */
function hunterOf(t: Tactic, before: Chess, user: Color): PieceAt | null {
  const from = t.moves[t.key]?.from;
  if (!from || t.moves.slice(0, t.key).some((m) => m.to === from)) return null;
  const hunter = pieceOn(before, from);
  return hunter && hunter.color !== user ? hunter : null;
}

/** The enemy slider, at most one piece away from seeing the king, whose line the king move steps off. */
function lineLeft(before: Chess, move: Move): PieceAt | null {
  const king = move.from;
  const kingTo = kingOf(new Chess(move.after), move.color).square;
  const same = (a: number[] | null, b: number[] | null) => a !== null && b !== null && a[0] === b[0] && a[1] === b[1];
  return (
    piecesOf(before, otherColor(move.color)).find((p) => {
      const direction = directionTo(p.square, king);
      if (!direction || !slidesAlong(p.type, direction) || same(direction, directionTo(p.square, kingTo))) return false;
      return SQUARES.filter((s) => isBetween(p.square, s, king) && before.get(s)).length <= 1;
    }) ?? null
  );
}

/** Whether the threat is aimed at the king or along a line through it. */
function aimsAtKing(t: Tactic): boolean {
  return t.moves[0].san.includes('+') || ['checkmate', 'mate-threat', 'discovered-attack', 'pin', 'skewer'].includes(t.id);
}

/** How `best`, the user's move from `fen`, stops the opponent's tactic `t`: "Ne5 blocks the line from the bishop on b2 to g7". */
export function stopText(fen: string, best: Move, t: Tactic, user: Color): Answer {
  const threat = t.moves[0];
  const before = new Chess(fen);
  const ref = (p: PieceAt) => refer(p, user);
  const maker = pieceOn(before, threat.from);
  if (maker && best.to === maker.square) return { text: `${best.san} takes ${ref(maker)}, the piece that would play ${bare(threat.san)}`, against: maker };
  const hunter = hunterOf(t, before, user);
  if (hunter && best.to === hunter.square) return { text: `${best.san} takes ${ref(hunter)} before it can strike`, against: hunter };
  for (const square of threatSquares(t, user, fen)) {
    const slider = blockedLine(before, best, square);
    if (!slider) continue;
    const there = pieceOn(before, square);
    const end = there?.color === user ? ref(there) : square;
    return { text: `${best.san} blocks the line from ${ref(slider)} to ${end}`, against: slider };
  }
  const clauses: string[] = [];
  const target = targetsOf(t, user).find((p) => p.square === best.from && p.type !== 'k');
  if (target) clauses.push(`moves ${ref(target)} ${t.id === 'fork' ? 'out of the fork' : 'out of reach'}`);
  const off = best.piece === 'k' && aimsAtKing(t) ? lineLeft(before, best) : null;
  if (off) clauses.push(`${isCastle(best) ? 'castles' : 'steps'} your king off ${lineThrough(off.square, best.from)}`);
  if (guards(fen, best, threat.to)) clauses.push(`guards ${threat.to}, where ${bare(threat.san)} would land`);
  if (maker && new Chess(best.after).attackers(maker.square, user).includes(best.to)) clauses.push(`attacks ${ref(maker)}`);
  if (clauses.length) return { text: `${best.san} ${listOf(clauses)}`, against: off ?? undefined };
  return { text: noLongerWorks(best, threat) };
}

/** The user's pieces a threat goes after: the forked ones, or the one it wins. */
function targetsOf(t: Tactic, user: Color): PieceAt[] {
  const forked = t.id === 'fork' ? t.targets.filter((p) => p.color === user) : [];
  return t.won?.color === user ? [t.won, ...forked] : forked;
}

/** Whether the move adds a guard to `square`. */
function guards(fen: string, move: Move, square: Square): boolean {
  const count = (at: string) => new Chess(at).attackers(square, move.color).length;
  return count(move.after) > count(fen);
}

/** "After h3, Ng4 is no longer possible", or that it no longer works. */
function noLongerWorks(best: Move, threat: Move): string {
  const chess = new Chess(best.after);
  const legal = chess.moves({ square: threat.from, verbose: true }).some((m) => m.to === threat.to && m.piece === threat.piece);
  return `After ${best.san}, ${bare(threat.san)} ${legal ? 'no longer works' : 'is no longer possible'}`;
}
