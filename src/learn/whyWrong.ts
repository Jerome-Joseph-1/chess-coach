import { Chess, type Color, type Move, type PieceSymbol, type Square } from 'chess.js';
import { NAME, attackedTargets } from '../board/captions';
import type { Game, Turn } from '../content/types';
import type { HintLevel } from '../pause/flow';
import { moveBefore } from '../pause/position';
import { VALUE, captureGain, kingOf, otherColor, passTurn, playLine, uciOf, type PieceAt } from './board';
import { costOf, couldTakeBefore, giveaway, hangingAfter, mateAfter, settled, wasLoose } from './loss';
import { attacked, baitText, blunderText, capturedRef, clause, tempting, type Caught, type Say } from './punishText';
import { tacticIn, type Tactic, type TacticId } from './tactics';
import { punishment, type Role, type Theme } from './themes';
import { capturedSquare } from './trade';
import { colorName, listOf } from './words';

/**
 * blunder: the punishing line wins material or mates.
 * bait: the move is the position's common mistake, and its line wins material or mates.
 * ignores-threat: the punishing line carries out a threat the opponent already had.
 * weaker: loses under 10%, and no line wins material.
 * missed: loses 10% or more, but no line wins material: the chance just goes.
 * unknown: the move has no grade.
 */
export type WrongKind = 'blunder' | 'bait' | 'ignores-threat' | 'weaker' | 'missed' | 'unknown';

export interface WrongMove {
  kind: WrongKind;
  /** One or two plain sentences for the coach. Never names the best move or the game's move. */
  text: string;
  /** The opponent's punishing reply to show on the board (uci), or null to show nothing. */
  reply: string | null;
  /** Squares of what the reply wins or threatens, marked on the board. */
  targets: Square[];
  pattern?: TacticId;
}

const FALLBACK = 'Not quite. Try again.';
/** Win% a move may lose and still count as a weaker move rather than a miss. */
const MISS = 10;
/** Win% left after a missed chance below which the user ends up worse. */
const WORSE = 40;
/** The user's pieces a punishing line goes after. */
const TARGET_ROLES: Role[] = ['target', 'pinned', 'behind', 'trapped'];
/** Index in a punishing line from which a lone pawn won no longer counts. */
const LONG_LINE = 4;
/** Lichess's curve from centipawns to win%, which the grades use, and the win% at its ±1000 cap. */
const CURVE = 0.00368208;
const CAPPED = 97.5;

/** Why a punishment waits for the hint that marks the piece in trouble: it carries out the opponent's threat, or takes a piece that already hung. */
type Held = 'threat' | 'hanging' | null;

/**
 * Why `uci` is wrong at this key position, from what the move actually loses, told only as far as the hints
 * given allow. The best move is read only to keep the text from pointing at it.
 */
export function whyWrong(game: Game, turnIndex: number, uci: string, hint: HintLevel): WrongMove {
  const turn = game.turns[turnIndex];
  const [move] = playLine(turn.fen, [uci]);
  if (turn.grades[uci] === undefined || !move) return plain('unknown');
  const answers = [playLine(turn.fen, turn.lines.best?.slice(0, 1) ?? [])[0]?.san, game.moves[turn.ply]].filter((san) => san !== undefined);
  const after = pawnsAt(turn.bestWin - turn.grades[uci]);
  const say: Say = { turn, user: game.side, them: colorName(otherColor(game.side)), move, answers, after };
  const found = classify(game, say, hint >= 2);
  // With the move drawn on the board, there is nothing left to explain.
  return hint >= 3 ? plain(found.kind) : found;
}

// Each hint asks about the same move again, so what the lines show is worked out once per turn and move.
const caughtLines = new WeakMap<Turn, Map<string, Caught | null>>();
const exposures = new WeakMap<Turn, Map<string, Exposure>>();

function perMove<T>(cache: WeakMap<Turn, Map<string, T>>, { turn, move }: Say, find: () => T): T {
  const byMove = cache.get(turn) ?? new Map<string, T>();
  cache.set(turn, byMove);
  const uci = uciOf(move);
  if (!byMove.has(uci)) byMove.set(uci, find());
  return byMove.get(uci)!;
}

function plain(kind: WrongKind): WrongMove {
  return { kind, text: FALLBACK, reply: null, targets: [] };
}

function classify(game: Game, say: Say, named: boolean): WrongMove {
  const caught = perMove(caughtLines, say, () => caughtBy(say));
  const down = leftDown(game, say);
  if (down) return stillDown(say, down, caught, named);
  if (caught) return punished(say, caught, named);
  return unpunished(say, named);
}

function quietKind({ turn, move }: Say): WrongKind {
  return turn.grades[uciOf(move)] < MISS ? 'weaker' : 'missed';
}

/** The stored line that punishes the move, made fair to the user, and what the move costs in it. */
function caughtBy(say: Say): Caught | null {
  const { turn, move, user } = say;
  const uci = uciOf(move);
  const mistake = uci === turn.mistakeMove && turn.lines.mistake?.[0] === uci;
  let line = settled(move.after, (mistake ? turn.lines.mistake!.slice(1) : turn.refutations[uci]) ?? []);
  while (line.length) {
    const theme = punishment(turn.fen, uci, line, user);
    const t = theme?.tactic;
    if (!theme || !t) return null;
    const cut = giveaway(t);
    if (cut < 0) return paidFor(say, theme, t);
    line = settled(move.after, line.slice(0, cut));
  }
  return null;
}

/**
 * The punishment, when it is what the move pays for: mate, or material the best move doesn't lose as well. A lone
 * pawn won at the end of a long line says too little to blame the move on it.
 */
function paidFor(say: Say, theme: Theme, t: Tactic): Caught | null {
  const cost = costOf(say.turn.fen, say.move, t);
  if (t.id === 'checkmate') return { theme, t, cost };
  if (cost.trade.net <= 0 || bestLosesToo(say, t.moves[t.key])) return null;
  return cost.trade.net <= 1 && t.key >= LONG_LINE ? null : { theme, t, cost };
}

/** The best move's line answers with the same capture: that loss isn't this move's doing. */
function bestLosesToo({ turn }: Say, capture: Move): boolean {
  const [, reply] = playLine(turn.fen, turn.lines.best?.slice(0, 2) ?? []);
  return reply?.to === capture.to && reply.captured === capture.captured;
}

// ---- The opponent has just taken something, and the move doesn't take it back.

/** The piece the opponent has just taken, when the best move takes back, the move doesn't, and the user is that much down. */
function leftDown(game: Game, { turn, move }: Say): PieceSymbol | null {
  const last = lastMove(game, turn);
  if (!last?.captured || last.recapture || turn.lines.best?.[0]?.slice(2, 4) !== last.to || move.to === last.to) return null;
  const taken = last.captured as PieceSymbol;
  return turn.material <= 1 - VALUE[taken] ? taken : null;
}

const lastMoves = new WeakMap<Turn, ReturnType<typeof moveBefore>>();

function lastMove(game: Game, turn: Turn): ReturnType<typeof moveBefore> {
  if (!lastMoves.has(turn)) lastMoves.set(turn, moveBefore(game, turn.ply));
  return lastMoves.get(turn)!;
}

/** "After Bd5, you stay a queen down.", and from hint 2 how the piece that took gets away. */
function stillDown(say: Say, taken: PieceSymbol, caught: Caught | null, named: boolean): WrongMove {
  const kind = caught ? 'blunder' : quietKind(say);
  const lead = `After ${say.move.san}, you stay a ${NAME[taken]} down`;
  const [reply] = caught?.t.moves ?? playLine(say.move.after, say.turn.refutations[uciOf(say.move)]?.slice(0, 1) ?? []);
  if (!named || !reply) return { kind, text: `${lead}.`, reply: null, targets: [] };
  const escapes = new Chess(say.move.after).get(reply.from)?.type === taken && reply.piece === taken;
  if (!escapes) return { kind, text: `${lead}.`, reply: uciOf(reply), targets: [] };
  const takes = reply.captured ? `, taking ${capturedRef(say, reply)}` : '';
  const text = `${lead}: ${say.them}'s ${NAME[taken]} gets away with ${reply.san}${takes}.`;
  return { kind, text, reply: uciOf(reply), targets: reply.captured ? [capturedSquare(reply)] : [] };
}

// ---- A line that wins material or mates.

function punished(say: Say, caught: Caught, named: boolean): WrongMove {
  const held = heldBack(say, caught.t);
  const bait = uciOf(say.move) === say.turn.mistakeMove;
  const kind: WrongKind = held === 'threat' ? 'ignores-threat' : bait ? 'bait' : 'blunder';
  if (!held) return marked(kind, caught, bait ? baitText(say, caught) : blunderText(say, caught));
  const lead = held === 'threat' ? threatLead(say) : hangingLead(say, caught.t.moves[caught.t.key].captured === 'p');
  if (!named) return { kind, text: `${lead}.`, reply: null, targets: [], pattern: caught.t.id };
  return marked(kind, caught, `${lead}: ${clause(say, caught, { grabbed: Boolean(say.move.captured) })}.`);
}

function heldBack(say: Say, t: Tactic): Held {
  if (carriesThreat(say, t)) return 'threat';
  const square = capturedAtStart(t);
  return square && square !== say.move.to && wasLoose(say.turn.fen, square, say.user) ? 'hanging' : null;
}

/** "That doesn't stop White's threat", or "exf6 grabs the knight, but it doesn't stop Black's threat". */
function threatLead(say: Say): string {
  return say.move.captured ? `${tempting(say.move)}, but it doesn't stop ${say.them}'s threat` : `That doesn't stop ${say.them}'s threat`;
}

function hangingLead(say: Say, pawn: boolean): string {
  return `${tempting(say.move)}, but it leaves ${pawn ? 'a pawn' : 'a piece'} hanging`;
}

/** Where the piece taken at the key capture stood when the line began. */
function capturedAtStart(t: Tactic): Square | null {
  if (t.id === 'checkmate') return null;
  let square = capturedSquare(t.moves[t.key]);
  for (let i = t.key - 1; i >= 0; i--) if (t.moves[i].to === square && t.moves[i].color !== t.side) square = t.moves[i].from;
  return square;
}

/** The opponent plays a move of the threat it already had, on the way to the key capture. */
function carriesThreat({ turn, user }: Say, t: Tactic): boolean {
  const threat = [...threatMoves(turn, user), ...quietThreat(turn)];
  return t.moves.slice(0, t.key + 1).some((m, i) => i % 2 === 0 && threat.some((x) => sameMove(x, m)));
}

function sameMove(a: Move, b: Move): boolean {
  return uciOf(a) === uciOf(b) && a.captured === b.captured;
}

const threats = new WeakMap<Turn, Move[]>();

/** The moves of the threat the opponent would carry out if the user passed, when it wins something: its first move and its tactic's moves. */
function threatMoves(turn: Turn, user: Color): Move[] {
  const known = threats.get(turn);
  if (known) return known;
  const passed = passTurn(turn.fen);
  const tactic = passed && turn.lines.threat?.length ? tacticIn(passed, turn.lines.threat, otherColor(user)) : null;
  const moves = tactic ? [tactic.moves[0], tactic.moves[tactic.at], tactic.moves[tactic.key]] : [];
  threats.set(turn, moves);
  return moves;
}

/** The threat line's first move when it takes nothing but attacks a piece bigger than the attacker, or a loose one. */
function quietThreat(turn: Turn): Move[] {
  const passed = passTurn(turn.fen);
  const [move] = passed ? playLine(passed, turn.lines.threat?.slice(0, 1) ?? []) : [];
  if (!move || move.captured) return [];
  const hits = attackedTargets(new Chess(move.after), move.to, move.promotion ?? move.piece, move.color);
  return hits.some((p) => p.type !== 'k') ? [move] : [];
}

/** The reply on the board and the user's pieces it goes after, where they stand once the reply is played. */
function marked(kind: WrongKind, { theme, t, cost }: Caught, text: string): WrongMove {
  const [reply] = t.moves;
  const board = new Chess(reply.after);
  const user = otherColor(t.side);
  const pieces: PieceAt[] = theme.pieces.filter((p) => TARGET_ROLES.includes(p.role) && p.color === user);
  const forked = cost.forked.map((p) => ({ ...p, color: user }));
  // A mate goes after the king wherever it stands; a piece the reply has just taken is marked where it stood.
  const king = t.id === 'checkmate' ? [kingOf(board, user)] : [];
  const stands = (p: PieceAt) => board.get(p.square)?.type === p.type && board.get(p.square)?.color === p.color;
  const shown = [...king, ...pieces, ...forked, ...(t.won ? [t.won] : [])].filter((p) => stands(p) || p.square === reply.to);
  return { kind, text, reply: uciOf(reply), targets: [...new Set(shown.map((p) => p.square))], pattern: t.id };
}

// ---- No line wins anything: check the position after the move before calling it harmless.

function unpunished(say: Say, named: boolean): WrongMove {
  const kind = quietKind(say);
  const { mate, capture } = perMove(exposures, say, () => exposed(say));
  if (mate) return { kind, text: `After ${say.move.san}, ${mate.san.replace('#', '')} is checkmate.`, reply: uciOf(mate), targets: [] };
  if (capture) return hanging(say, kind, capture, named);
  return threatStillOn(say, named) ?? { kind, text: quietText(say, kind), reply: null, targets: [] };
}

interface Exposure {
  mate: Move | null;
  capture: Move | null;
}

/** A mate in one the move allows, or else a piece it leaves en prise. */
function exposed(say: Say): Exposure {
  const mate = mateAfter(say.move);
  const capture = mate ? null : hangingAfter(say.move);
  return { mate, capture: capture && reallyHangs(say, capture) ? capture : null };
}

/**
 * A capture the static check finds is only claimed when nothing says otherwise: the stored line doesn't start with
 * it (and win nothing), the best move doesn't allow it too, and the grades lose about as much as it takes.
 */
function reallyHangs(say: Say, capture: Move): boolean {
  const stored = say.turn.refutations[uciOf(say.move)]?.[0];
  return stored !== uciOf(capture) && !bestLosesToo(say, capture) && gradeDrop(say) >= captureGain(capture) - 1;
}

/** The pawns the move gives away by the grades. */
function gradeDrop({ turn, after }: Say): number {
  return pawnsAt(turn.bestWin) - after;
}

/** A win% read back as an evaluation in pawns through the curve the grades use. */
function pawnsAt(win: number): number {
  const capped = Math.min(CAPPED, Math.max(100 - CAPPED, win));
  return Math.log(capped / (100 - capped)) / CURVE / 100;
}

/** A piece the move leaves en prise; held back to hint 2 when it hung before the move too. */
function hanging(say: Say, kind: WrongKind, capture: Move, named: boolean): WrongMove {
  const piece = capturedRef(say, capture);
  if (!couldTakeBefore(say.turn.fen, capture)) {
    return { kind, text: `After ${say.move.san}, ${say.them} can take ${piece}.`, reply: uciOf(capture), targets: [capture.to] };
  }
  const threat = threatMoves(say.turn, say.user).some((m) => sameMove(m, capture));
  const lead = threat ? threatLead(say) : hangingLead(say, capture.captured === 'p');
  const heldKind = threat ? 'ignores-threat' : kind;
  if (!named) return { kind: heldKind, text: `${lead}.`, reply: null, targets: [] };
  return { kind: heldKind, text: `${lead}: ${capture.san} wins ${piece}.`, reply: uciOf(capture), targets: [capture.to] };
}

/**
 * The stored line still opens with the opponent's threat, though it wins nothing by force, and the best move
 * doesn't allow it: say so, and from hint 2 what the threat hits.
 */
function threatStillOn(say: Say, named: boolean): WrongMove | null {
  const [reply] = playLine(say.move.after, say.turn.refutations[uciOf(say.move)]?.slice(0, 1) ?? []);
  if (!reply || !threatMoves(say.turn, say.user).some((m) => sameMove(m, reply)) || bestLosesToo(say, reply)) return null;
  const lead = threatLead(say);
  if (!named) return { kind: 'ignores-threat', text: `${lead}.`, reply: null, targets: [] };
  const hit = attacked(say, reply);
  const parts = [
    ...(reply.captured ? [`takes ${capturedRef(say, reply)}`] : []),
    ...(reply.san.includes('+') ? ['checks your king'] : []),
    ...(hit.length ? [`attacks ${listOf(hit)}`] : []),
  ];
  const does = parts.length ? `: ${reply.san} ${listOf(parts)}${parts.length > 1 ? ' at once' : ''}` : '';
  return { kind: 'ignores-threat', text: `${lead}${does}.`, reply: uciOf(reply), targets: [] };
}

/** Nothing hangs: say only that something better was there, and whether the user ends up worse. */
function quietText({ turn, move, them }: Say, kind: WrongKind): string {
  if (kind === 'weaker') return "There's a stronger move here.";
  const worse = turn.bestWin - turn.grades[uciOf(move)] < WORSE;
  if (turn.kinds.includes('win')) return `${move.san} lets the chance go${worse ? ', and you end up worse' : ''}.`;
  const better = turn.kinds.includes('defend') ? `There's a better answer to ${them}'s threat` : "There's a much stronger move here";
  return worse ? `${better}, and after ${move.san} you end up worse.` : `${better}.`;
}
