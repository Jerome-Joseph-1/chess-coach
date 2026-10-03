import { Chess, type Color, type Move, type PieceSymbol, type Square } from 'chess.js';
import { NAME, attackedTargets } from '../board/captions';
import type { Game, Turn } from '../content/types';
import type { HintLevel } from '../pause/flow';
import { moveBefore } from '../pause/position';
import { VALUE, captureGain, kingOf, otherColor, passTurn, playLine, uciOf, type PieceAt } from './board';
import { costOf, couldTakeBefore, giveaway, hangingAfter, mateAfter, nothingHangs, settled, wasLoose } from './loss';
import {
  afterLead,
  attacked,
  baitText,
  blunderText,
  capitalize,
  capturedRef,
  mateInOne,
  played,
  taking,
  type Caught,
  type Say,
} from './punishText';
import { situationsOf, type Situation } from './situation';
import { tacticIn, type Tactic, type TacticId } from './tactics';
import { punishment, themeFor, type Role, type Theme } from './themes';
import { capturedSquare, tradeOf } from './trade';
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
  /** One or two short, plain sentences for the coach. Never names the best move or the game's move. */
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
/** Win% after a move below which the user is worse, and above which the user is still better. */
const WORSE = 40;
const BETTER = 58;
/** The user's pieces a punishing line goes after. */
const TARGET_ROLES: Role[] = ['target', 'pinned', 'behind', 'trapped'];
/** Index in a punishing line from which a lone pawn won no longer counts. */
const LONG_LINE = 4;
/** Lichess's curve from centipawns to win%, which the grades use, and the win% at its ±1000 cap. */
const CURVE = 0.00368208;
const CAPPED = 97.5;

/** Why a punishment is told differently: it carries out the opponent's threat, or takes a piece that already hung. */
type Held = 'threat' | 'hanging' | null;

/**
 * Why `uci` is wrong at this key position, from what the move actually loses. A threat the move fails to stop is
 * shown at once; a piece that already hung is named only from the hint that marks it, since naming it would point
 * at the answer. The best move is read only to keep the text from pointing at it.
 */
export function whyWrong(game: Game, turnIndex: number, uci: string, hint: HintLevel): WrongMove {
  const turn = game.turns[turnIndex];
  const [move] = playLine(turn.fen, [uci]);
  if (turn.grades[uci] === undefined || !move) return plain('unknown');
  const answers = [playLine(turn.fen, turn.lines.best?.slice(0, 1) ?? [])[0]?.san, game.moves[turn.ply]].filter((san) => san !== undefined);
  const after = pawnsAt(turn.bestWin - turn.grades[uci]);
  const say: Say = { turn, user: game.side, them: colorName(otherColor(game.side)), move, answers, after };
  const found = classify({ game, turnIndex, hint }, say);
  // With the move drawn on the board, there is nothing left to explain.
  return hint >= 3 ? plain(found.kind) : found;
}

/** Where the question stands: the game, the turn asked, and the hints given. */
interface Asked {
  game: Game;
  turnIndex: number;
  hint: HintLevel;
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

function classify(asked: Asked, say: Say): WrongMove {
  const caught = perMove(caughtLines, say, () => caughtBy(say));
  const down = leftDown(asked.game, say);
  const named = asked.hint >= 2;
  if (down) return stillDown(say, down, caught, named);
  if (caught) return punished(say, caught, named);
  return unpunished(asked, say);
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

/** "After that move, you are still a queen down.", and from hint 2 how the piece that took gets away. */
function stillDown(say: Say, taken: PieceSymbol, caught: Caught | null, named: boolean): WrongMove {
  const kind = caught ? 'blunder' : quietKind(say);
  const lead = `After that move, you are still a ${NAME[taken]} down`;
  const [reply] = caught?.t.moves ?? playLine(say.move.after, say.turn.refutations[uciOf(say.move)]?.slice(0, 1) ?? []);
  if (!named || !reply) return { kind, text: `${lead}.`, reply: null, targets: [] };
  const escapes = new Chess(say.move.after).get(reply.from)?.type === taken && reply.piece === taken;
  if (!escapes) return { kind, text: `${lead}.`, reply: uciOf(reply), targets: [] };
  const away = reply.captured ? `by taking ${capturedRef(say, reply)}` : `to ${reply.to}`;
  const text = `${lead}: ${say.them}'s ${NAME[taken]} gets away ${away}.`;
  return { kind, text, reply: uciOf(reply), targets: reply.captured ? [capturedSquare(reply)] : [] };
}

// ---- A line that wins material or mates.

function punished(say: Say, caught: Caught, named: boolean): WrongMove {
  const held = heldBack(say, caught.t);
  const bait = uciOf(say.move) === say.turn.mistakeMove;
  const kind: WrongKind = held === 'threat' ? 'ignores-threat' : bait ? 'bait' : 'blunder';
  // The user has moved and the threat stood: showing what it does gives away nothing about how to stop it.
  if (held === 'threat') return marked(kind, caught, afterLead(say, caught, threatLead(say)));
  if (!held) return marked(kind, caught, bait ? baitText(say, caught) : blunderText(say, caught));
  const pawn = caught.t.moves[caught.t.key].captured === 'p';
  if (!named) return { kind, text: hangingText(say, pawn), reply: null, targets: [], pattern: caught.t.id };
  return marked(kind, caught, afterLead(say, caught, hangingLead(say, pawn)));
}

function heldBack(say: Say, t: Tactic): Held {
  if (carriesThreat(say, t)) return 'threat';
  const square = capturedAtStart(t);
  return square && square !== say.move.to && wasLoose(say.turn.fen, square, say.user) ? 'hanging' : null;
}

/** "That doesn't stop White's threat", or "Taking the knight on f6 doesn't stop Black's threat". */
function threatLead(say: Say): string {
  return `${say.move.captured ? taking(say.move) : 'That'} doesn't stop ${say.them}'s threat`;
}

/** "One of your pieces is still in danger", "Taking the knight on d4 leaves one of your pawns in danger". */
function hangingLead(say: Say, pawn: boolean): string {
  const one = `one of your ${pawn ? 'pawns' : 'pieces'}`;
  return say.move.captured ? `${taking(say.move)} leaves ${one} in danger` : `${capitalize(one)} is still in danger`;
}

/** Before the piece is marked: that something already hung, and a question that sends the user looking for it. */
function hangingText(say: Say, pawn: boolean): string {
  return `${hangingLead(say, pawn)}. Which one can ${say.them} take?`;
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

const threats = new WeakMap<Turn, Tactic | null>();

/** The tactic the opponent would carry out if the user passed, when it wins something. */
function threatTactic(turn: Turn, user: Color): Tactic | null {
  if (threats.has(turn)) return threats.get(turn)!;
  const passed = passTurn(turn.fen);
  const tactic = passed && turn.lines.threat?.length ? tacticIn(passed, turn.lines.threat, otherColor(user)) : null;
  threats.set(turn, tactic);
  return tactic;
}

/** The moves of the threat: its first move and its tactic's moves. */
function threatMoves(turn: Turn, user: Color): Move[] {
  const tactic = threatTactic(turn, user);
  return tactic ? [tactic.moves[0], tactic.moves[tactic.at], tactic.moves[tactic.key]] : [];
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

function unpunished(asked: Asked, say: Say): WrongMove {
  const kind = quietKind(say);
  const { mate, capture } = perMove(exposures, say, () => exposed(say));
  if (mate) return { kind, text: mateInOne(say, mate), reply: uciOf(mate), targets: [] };
  if (capture) return hanging(say, kind, capture, asked.hint >= 2);
  return threatStillOn(say) ?? quiet(asked, say, kind);
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

/** A piece the move leaves en prise. A threat it fails to stop is shown at once; a piece that already hung waits for hint 2. */
function hanging(say: Say, kind: WrongKind, capture: Move, named: boolean): WrongMove {
  const piece = capturedRef(say, capture);
  const shown = { reply: uciOf(capture), targets: [capturedSquare(capture)] };
  if (!couldTakeBefore(say.turn.fen, capture)) return { kind, text: `After that, ${say.them} can take ${piece}.`, ...shown };
  const pawn = capture.captured === 'p';
  if (threatMoves(say.turn, say.user).some((m) => sameMove(m, capture))) {
    return { kind: 'ignores-threat', text: `${threatLead(say)}: ${played(say, capture)}.`, ...shown };
  }
  if (!named) return { kind, text: hangingText(say, pawn), reply: null, targets: [] };
  return { kind, text: `${hangingLead(say, pawn)}: ${played(say, capture)}.`, ...shown };
}

/**
 * The stored line still opens with the opponent's threat, though it wins nothing by force, and the best move
 * doesn't allow it: say so, and show what the threat hits.
 */
function threatStillOn(say: Say): WrongMove | null {
  const [reply] = playLine(say.move.after, say.turn.refutations[uciOf(say.move)]?.slice(0, 1) ?? []);
  if (!reply || !threatMoves(say.turn, say.user).some((m) => sameMove(m, reply)) || bestLosesToo(say, reply)) return null;
  return { kind: 'ignores-threat', text: `${threatLead(say)}: ${threatDoes(say, reply)}.`, reply: uciOf(reply), targets: [] };
}

/** "White's knight moves to d6, gives check and attacks your bishop on f5". */
function threatDoes(say: Say, reply: Move): string {
  const hit = attacked(say, reply);
  const text = played(say, reply, false);
  const extras = [...(reply.san.includes('+') ? ['gives check'] : []), ...(hit.length ? [`attacks ${listOf(hit)}`] : [])];
  if (!extras.length) return text;
  return extras.length > 1 ? `${text}, ${extras[0]} and ${extras[1]}` : `${text} and ${extras[0]}`;
}

// ---- Nothing is lost by force: say what the move does and doesn't do, and where to look instead.

/** The answers to "What's going on here?" that fit the turn: those the user picked from, or the turn's kinds on a follow-up move. */
function situationsAt({ game, turnIndex }: Asked): Situation[] {
  const turn = game.turns[turnIndex];
  if (turn.label === 'critical') return situationsOf(game, turnIndex);
  return turn.kinds.length ? turn.kinds : ['quiet'];
}

/**
 * A move no line punishes: what it does and doesn't do in the kind of position the user already named, how the
 * position stands after it when it gives away a lot, and a question or a place to look that doesn't give the move away.
 */
function quiet(asked: Asked, say: Say, kind: WrongKind): WrongMove {
  const situations = situationsAt(asked);
  const has = (s: Situation) => situations.includes(s);
  const stands = has('defend') ? threatStands(say) : null;
  const blank = { kind, reply: null, targets: [] as Square[] };
  if (stands) return { ...blank, ...stillThreatened(say, stands, kind) };
  const safe = nothingHangs(say.move);
  const missed = kind === 'missed';
  const standing = missed ? standingAfter(say) : '';
  if (has('attack') || has('win')) {
    const attack = has('attack');
    const look = lookFor(asked, attack);
    // Only the best move is known to win: say what it does, not that the user's move wins nothing.
    if (attack) {
      const miss = missed ? `That misses a strong attack on the king: after it, ${standing}` : `${safe ? "That's safe, but y" : 'Y'}ou have a stronger attack on the king`;
      return { ...blank, text: `${miss}. ${look}` };
    }
    if (missed) {
      const miss = winsSome(say) ? `Another move wins more: after yours, ${standing}` : `That misses a chance to win material: after it, ${standing}`;
      return { ...blank, text: `${miss}. ${look}` };
    }
    // What the move itself takes is certain; what it may still win later is not.
    if (say.move.captured) return { ...blank, text: `${safe ? "That's safe, but there" : 'There'} is a better move. ${look}` };
    return { ...blank, text: `${safe ? "That's safe, but it" : 'That'} doesn't win material right away. ${look}` };
  }
  if (has('defend')) {
    const look = 'Look at every way to defend.';
    if (stands === false) {
      const but = missed ? `after it ${standing}` : 'there is a better way to do it';
      return { ...blank, text: `That stops ${say.them}'s threat, but ${but}. ${look}` };
    }
    if (missed) return { ...blank, text: `After that, ${standing}. ${look}` };
    return { ...blank, text: `${safe ? "That's safe, but there" : 'There'} is a better way to defend. ${look}` };
  }
  if (has('trap')) {
    const look = 'Think about what your opponent can do after each natural move.';
    if (uciOf(say.move) === say.turn.mistakeMove) return { ...blank, text: 'Careful: think about what your opponent can do after that natural move.' };
    if (missed) return { ...blank, text: `That avoids the trap, but after it ${standing}. ${look}` };
    return { ...blank, text: `That avoids the trap, but there is a better move. ${look}` };
  }
  if (missed) return { ...blank, text: `After that, ${standing}. Which of your pieces could do more?` };
  return { ...blank, text: `${safe ? "That's safe, but there is" : 'There is'} a better move. Which of your pieces could do more?` };
}

/** "the position is about even", "you are worse": where the grades leave the user after the move. */
function standingAfter({ turn, move }: Say): string {
  const win = turn.bestWin - turn.grades[uciOf(move)];
  if (win < WORSE) return 'you are worse';
  return win <= BETTER ? 'the position is about even' : 'you are still better, but by less';
}

/** The move takes something for good, or the line that answers it leaves the user ahead in material. */
function winsSome({ turn, move, user }: Say): boolean {
  if (move.captured && captureGain(move) > 0) return true;
  const line = playLine(turn.fen, [uciOf(move), ...(turn.refutations[uciOf(move)] ?? [])]);
  return tradeOf(line, user).net > 0;
}

const LOOK: Partial<Record<TacticId, string>> = {
  fork: 'Look for a move that attacks two pieces at once.',
  pin: "Look for an enemy piece that can't move without exposing a bigger one.",
  skewer: 'Look for a big piece you can attack with another piece behind it.',
  'discovered-attack': 'Look for a piece you can move out of the way of another.',
  'trapped-piece': 'Look for an enemy piece with no safe square.',
  'remove-defender': 'Look for a defender you can take or chase away.',
  'mate-threat': 'Look for a move that threatens checkmate.',
  checkmate: 'Look at every check you can give.',
};

/** Where to look for the win: in general before the pattern is named, then for the pattern named at hint 1. */
function lookFor(asked: Asked, attack: boolean): string {
  const general = attack ? 'Look at every check and threat you have.' : "Look for an enemy piece that isn't protected enough.";
  if (asked.hint < 1) return general;
  const theme = themeFor(asked.game, asked.turnIndex);
  return (theme.id !== 'bait' && LOOK[theme.id as TacticId]) || general;
}

/**
 * Whether the threat the opponent had still works after the move: its line still wins material when played from
 * there. Null when the opponent had no threat that wins material.
 */
function threatStands({ turn, move, user }: Say): Move | false | null {
  return threatTactic(turn, user) ? threatMove(turn, move, user) : null;
}

/** The threat's first move, when its line still wins material or mates from the position after the move. */
function threatMove(turn: Turn, move: Move, user: Color): Move | false {
  const line = turn.lines.threat ?? [];
  const tactic = tacticIn(move.after, line, otherColor(user));
  const [first] = playLine(move.after, line.slice(0, 1));
  return tactic && first && (tactic.id === 'checkmate' || captureGain(first) > 0 || !first.captured) ? first : false;
}

/** "That doesn't stop White's threat: White's knight moves to d6 and attacks your bishop." and the threat shown. */
function stillThreatened(say: Say, first: Move, kind: WrongKind): Pick<WrongMove, 'text' | 'reply' | 'targets'> {
  const standing = kind === 'missed' ? ` After your move, ${standingAfter(say)}.` : '';
  return { text: `${threatLead(say)}: ${threatDoes(say, first)}.${standing}`, reply: uciOf(first), targets: [] };
}
