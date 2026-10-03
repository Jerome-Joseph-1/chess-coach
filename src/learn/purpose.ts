// What a single move does, in a few words: why a tempting move appeals, how a defence works, what a safe move offers.
import { Chess, SQUARES, type Color, type Move, type PieceSymbol, type Square } from 'chess.js';
import { NAME, attackedTargets, squareAt } from '../board/captions';
import {
  VALUE,
  backRank,
  captureGain,
  directionTo,
  isBetween,
  isLoose,
  kingOf,
  otherColor,
  passTurn,
  pieceOn,
  piecesOf,
  slidesAlong,
  uciOf,
  type PieceAt,
} from './board';
import type { Tactic } from './tactics';
import type { Claim } from './walkthrough';
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

/** A clause on what a move does, and the facts on the board it rests on. */
export interface Reason {
  text: string;
  claims: Claim[];
}

const reason = (text: string, ...claims: Claim[]): Reason => ({ text, claims });

/** "castling" for a castling move, which beginners may not read as O-O, else its SAN. */
export function moveName(move: Move): string {
  return isCastle(move) ? 'castling' : move.san;
}

/** The move's name to start a sentence with: a SAN keeps its case, so a pawn move stays "g3". */
export function moveSubject(move: Move): string {
  return isCastle(move) ? 'Castling' : move.san;
}

/** What a move plainly does: castle, take, give check, attack; the clauses `purpose` and a trap's answer start from. */
export function moveFacts(move: Move, user: Color): Reason[] {
  return facts(move, user, 'gets your king to safety').map((text) => reason(text));
}

/** What a safe move does for the user, as clauses after its SAN: "takes the bishop", "guards your knight on e5". */
export function purpose(move: Move, user: Color): Reason[] {
  const plain = moveFacts(move, user);
  if (plain.length) return plain;
  if (develops(move)) return [reason(`develops your ${NAME[move.piece]}`)];
  if (makesLuft(move)) return [reason('gives your king a square to escape to')];
  if (escapes(move) && !isLoose(move.after, move.to)) {
    const safe: Claim = { claim: 'safe', square: move.to, fen: move.after };
    return [reason(`takes your ${NAME[move.piece]} on ${move.from} out of danger`, { claim: 'hangs', square: move.from, fen: move.before }, safe)];
  }
  if (move.piece === 'r' && move.from[0] !== move.to[0] && openFile(move.after, move.to[0])) {
    return [reason(`puts your rook on the open ${move.to[0]}-file`)];
  }
  const quiet = threatensMate(move) ?? guardsAttacked(move, user) ?? blocksAttack(move, user) ?? clearsLine(move, user) ?? hitsPawn(move);
  return quiet ? [quiet] : [];
}

/** The mate the move would give next if the opponent did nothing: "threatens Qxh7 mate". */
function threatensMate(move: Move): Reason | null {
  const again = passTurn(move.after);
  if (!again) return null;
  const mate = new Chess(again).moves({ verbose: true }).find((m) => m.san.endsWith('#'));
  return mate ? reason(`threatens ${mate.san.slice(0, -1)} mate`, { claim: 'mates', move: uciOf(mate), fen: again }) : null;
}

/** The biggest of the user's attacked pieces that the move adds a guard to: "guards your knight on e5". */
function guardsAttacked(move: Move, user: Color): Reason | null {
  const [before, after] = [new Chess(move.before), new Chess(move.after)];
  const enemy = otherColor(user);
  const guarded = piecesOf(after, user)
    .filter((p) => p.type !== 'k' && p.square !== move.to && after.attackers(p.square, enemy).length > 0)
    .filter((p) => after.attackers(p.square, user).length > before.attackers(p.square, user).length)
    .sort((a, b) => VALUE[b.type] - VALUE[a.type])[0];
  if (!guarded) return null;
  return reason(`guards ${refer(guarded, user)}`, { claim: 'guards', square: guarded.square, squares: after.attackers(guarded.square, user), fen: move.after });
}

/** An enemy slider's attack on one of the user's pieces that the move steps in front of. */
function blocksAttack(move: Move, user: Color): Reason | null {
  const before = new Chess(move.before);
  const enemy = otherColor(user);
  for (const target of piecesOf(before, user)) {
    if (target.square === move.from || !before.attackers(target.square, enemy).length) continue;
    const slider = blockedLine(before, move, target.square);
    if (!slider) continue;
    const claim: Claim = { claim: 'blocks', square: move.to, from: slider.square, to: target.square, fen: move.after };
    return reason(`blocks the line from ${refer(slider, user)} to ${refer(target, user)}`, claim);
  }
  return null;
}

/** A slider of the user's that now reaches past the square the move left: "clears the diagonal for your bishop on c8". */
function clearsLine(move: Move, user: Color): Reason | null {
  const [before, after] = [new Chess(move.before), new Chess(move.after)];
  for (const slider of piecesOf(after, user)) {
    const direction = directionTo(slider.square, move.from);
    if (slider.square === move.to || !direction || !slidesAlong(slider.type, direction)) continue;
    const beyond = squareAt(move.from.charCodeAt(0) - 97 + direction[0], Number(move.from[1]) - 1 + direction[1]);
    if (!beyond || !after.attackers(beyond, user).includes(slider.square) || before.attackers(beyond, user).includes(slider.square)) continue;
    const claim: Claim = { claim: 'attacks', square: slider.square, squares: [beyond], fen: move.after };
    return reason(`clears ${lineThrough(slider.square, move.from)} for ${refer(slider, user)}`, claim);
  }
  return null;
}

/** A pawn the moved piece attacks, guarded or not. */
function hitsPawn(move: Move): Reason | null {
  const after = new Chess(move.after);
  const enemy = otherColor(move.color);
  const pawn = piecesOf(after, enemy).find((p) => p.type === 'p' && after.attackers(p.square, move.color).includes(move.to));
  if (!pawn) return null;
  return reason(`attacks the pawn on ${pawn.square}`, { claim: 'attacks', square: move.to, squares: [pawn.square], fen: move.after });
}

/** How a move answers a threat, the enemy piece it works against, and the facts on the board it rests on. */
export interface Answer {
  text: string;
  against?: PieceAt;
  claims?: Claim[];
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
  const name = moveSubject(best);
  const maker = pieceOn(before, threat.from);
  if (maker && best.to === maker.square) return { text: `${name} takes ${ref(maker)}, the piece that would play ${bare(threat.san)}`, against: maker };
  const hunter = hunterOf(t, before, user);
  if (hunter && best.to === hunter.square) return { text: `${name} takes ${ref(hunter)} before it can strike`, against: hunter };
  for (const square of threatSquares(t, user, fen)) {
    const slider = blockedLine(before, best, square);
    if (!slider) continue;
    const there = pieceOn(before, square);
    const end = there?.color === user ? ref(there) : square;
    return { text: `${name} blocks the line from ${ref(slider)} to ${end}`, against: slider };
  }
  const clauses: Reason[] = [];
  const target = targetsOf(t, user).find((p) => p.square === best.from && p.type !== 'k');
  if (target) clauses.push(reason(`moves ${ref(target)} ${t.id === 'fork' ? 'out of the fork' : 'out of reach'}`));
  const off = best.piece === 'k' && aimsAtKing(t) ? lineLeft(before, best) : null;
  if (off) clauses.push(reason(`${isCastle(best) ? 'castles' : 'steps'} your king off ${lineThrough(off.square, best.from)}`));
  const guard = newGuard(fen, best, threat.to);
  if (guard) clauses.push(guardClause(best, threat, guard, user));
  if (maker && new Chess(best.after).attackers(maker.square, user).includes(best.to)) clauses.push(reason(`attacks ${ref(maker)}`));
  const room = t.id === 'trapped-piece' ? roomFor(t.trapped, best, user) : null;
  if (room) clauses.push(room);
  if (!clauses.length) return { text: noLongerWorks(best, threat) };
  return { text: `${name} ${listOf(clauses.map((c) => c.text))}`, against: off ?? undefined, claims: clauses.flatMap((c) => c.claims) };
}

/** "guards c7, where Nc7 would land", naming the guard when it is not simply the piece that moved. */
function guardClause(best: Move, threat: Move, guard: Square, user: Color): Reason {
  const claim: Claim = { claim: 'attacks', square: guard, squares: [threat.to], fen: best.after };
  const lands = `${threat.to}, where ${bare(threat.san)} would land`;
  if (guard === best.to && !isCastle(best)) return reason(`guards ${lands}`, claim);
  const piece = refer(pieceOn(new Chess(best.after), guard)!, user);
  return reason(isCastle(best) ? `brings ${piece} to guard ${lands}` : `lets ${piece} guard ${lands}`, claim);
}

/** The square the move leaves, when the trapped piece can now go there: "clears b1 for your rook on a1". */
function roomFor(trapped: PieceAt, best: Move, user: Color): Reason | null {
  if (trapped.color !== user || best.from === trapped.square) return null;
  const after = new Chess(best.after);
  if (!after.attackers(best.from, user).includes(trapped.square)) return null;
  return reason(`clears ${best.from} for ${refer(trapped, user)}`, { claim: 'attacks', square: trapped.square, squares: [best.from], fen: best.after });
}

/** The user's pieces a threat goes after: the forked ones, or the one it wins. */
function targetsOf(t: Tactic, user: Color): PieceAt[] {
  const forked = t.id === 'fork' ? t.targets.filter((p) => p.color === user) : [];
  return t.won?.color === user ? [t.won, ...forked] : forked;
}

/** The square of a piece the move puts on guard of `square`, if it adds a guard. */
function newGuard(fen: string, move: Move, square: Square): Square | null {
  const [before, after] = [new Chess(fen).attackers(square, move.color), new Chess(move.after).attackers(square, move.color)];
  if (after.length <= before.length) return null;
  return after.find((s) => s === move.to) ?? after.find((s) => !before.includes(s)) ?? null;
}

/** "After h3, Ng4 is no longer possible", or that it no longer works. */
function noLongerWorks(best: Move, threat: Move): string {
  const chess = new Chess(best.after);
  const legal = chess.moves({ square: threat.from, verbose: true }).some((m) => m.to === threat.to && m.piece === threat.piece);
  return `After ${moveName(best)}, ${bare(threat.san)} ${legal ? 'no longer works' : 'is no longer possible'}`;
}
