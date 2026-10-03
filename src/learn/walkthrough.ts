import { Chess, type Color, type Move, type Square } from 'chess.js';
import { NAME, attackedTargets } from '../board/captions';
import type { ArrowTone, Tone } from '../board/types';
import type { Game, Turn } from '../content/types';
import {
  VALUE,
  backers,
  directionTo,
  exchangeGain,
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
  uciOf,
  type Backer,
  type PieceAt,
} from './board';
import { ideaOf, replyText } from './ideas';
import { appeal, lineThrough, looksFree, purpose, stopText, takenText } from './purpose';
import type { Tactic, TacticId } from './tactics';
import { isWin, themeFor, type Theme, type ThemePiece } from './themes';
import { tradeOf } from './trade';
import { capitalize, colorName, listOf, netText, refer, sequence, tradeText } from './words';

/** A fact a beat's text states about its position, so a test or a report can check it on the board. */
export type Claim =
  | { claim: 'undefended' | 'hangs'; square: Square }
  /** Exactly these pieces of the other side attack the piece on `square`. */
  | { claim: 'attackers'; square: Square; squares: Square[] }
  /** Exactly these pieces of its own side guard the piece on `square`. */
  | { claim: 'guards'; square: Square; squares: Square[] }
  /** The piece on `square` attacks every piece on `squares`. */
  | { claim: 'attacks'; square: Square; squares: Square[] }
  /** Where the piece could go if its side were to move, and which of those squares lose it. */
  | { claim: 'escape-squares'; square: Square; squares: Square[]; covered: Square[] }
  /** The squares around a king: taken by its own pieces, attacked, and free. */
  | { claim: 'boxed'; square: Square; blocked: Square[]; covered: Square[]; free: Square[] }
  /** Two pieces on one line with nothing between them. */
  | { claim: 'in-line'; squares: [Square, Square] }
  /** The only piece between `from` and `to`. */
  | { claim: 'blocks'; square: Square; from: Square; to: Square }
  /** The piece on `square` stands right behind the one on `front`, on its line to `target`. */
  | { claim: 'backs'; square: Square; front: Square; target: Square }
  | { claim: 'pin'; square: Square; pinner: Square; behind: Square };

type Mark = { square: Square; tone: Tone };
type Arrow = { from: Square; to: Square; tone: ArrowTone };

/** One step of a worked example: a position, what to look at on it, and what the coach says. */
export interface Beat {
  fen: string;
  /** The last move that led to `fen`, as uci, so the board can slide it. */
  move?: string;
  text: string;
  marks: Mark[];
  arrows: Arrow[];
  /** Set when the user should play this beat's next move on the board, e.g. "Your move: take the knight." */
  ask?: string;
  /** The move `ask` waits for, as uci. */
  answer?: string;
  /** Ends the example: the moves that follow from `fen`, to play out like the answer screen. */
  line?: string[];
  claims?: Claim[];
}

type Of<K extends TacticId> = Extract<Tactic, { id: K }>;

interface Context {
  fen: string;
  turn: Turn;
  theme: Theme;
  user: Color;
  /** The opponent, "White" or "Black". */
  them: string;
  ref: (piece: PieceAt) => string;
  /** The moves the example plays from the turn's position. */
  shown: Move[];
}

/** Plies of the best line shown after a defence or a trap before it looks for a quiet place to stop. */
const DEFENCE_PLIES = 4;
const MAX_PLIES = 10;
/** Longest run of moves spelled out before a pin pays off. */
const SHORT_LEAD = 4;
const COUNT = ['no', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight'];
const MORE = ['nine', 'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen'];

/** The worked example of a key position, step by step, ending on the line that follows. */
export function walkthrough(game: Game, turnIndex: number): Beat[] {
  const turn = game.turns[turnIndex];
  const user = game.side;
  const theme = themeFor(game, turnIndex);
  const c: Context = {
    fen: turn.fen,
    turn,
    theme,
    user,
    them: colorName(otherColor(user)),
    ref: (piece) => refer(piece, user),
    shown: shownLine(turn, theme, user),
  };
  const taught = steps(c);
  const beats = taught ?? lookAt(c);
  return [...beats, lineBeat(c, beats.at(-1), taught !== null)];
}

/**
 * The moves an example plays from the turn's position: a win through its winning capture and the reply,
 * anything else a few moves; then on past every capture and any deficit, so the material has settled.
 */
export function shownLine(turn: Turn, theme: Theme, user: Color): Move[] {
  const moves = playLine(turn.fen, turn.lines.best ?? []);
  const t = theme.tactic;
  const end = t && isWin(theme) ? Math.max(t.key + 1, 2) : DEFENCE_PLIES;
  return moves.slice(0, quietEnd(moves, end, user));
}

/** The first stop at or after `end` that is not right before a capture, nor with `side` behind on material. */
function quietEnd(moves: Move[], end: number, side: Color): number {
  const cap = Math.min(moves.length, MAX_PLIES);
  let stop = Math.min(end, cap);
  while (stop < cap && (moves[stop].captured || tradeOf(moves.slice(0, stop), side).net < 0)) stop++;
  return stop;
}

/** The template's beats; null when none fits, so the pieces are only pointed at. */
function steps(c: Context): Beat[] | null {
  const t = c.theme.tactic;
  if (!t) return null;
  switch (c.theme.id) {
    case 'hanging-own':
      return hangingOwn(c, t);
    case 'threat-other':
      return threatOther(c, t);
    case 'bait':
      return bait(c, t);
  }
  // Every template reads the pieces where they stand now, so the tactic must start with this move.
  return t.at === 0 ? winSteps(c, t) : null;
}

function winSteps(c: Context, t: Tactic): Beat[] | null {
  switch (t.id) {
    case 'free-piece':
      return freePiece(c, t);
    case 'fork':
      return fork(c, t);
    case 'pin':
      return t.how === 'created' ? pinCreated(c, t) : pinExploited(c, t);
    case 'skewer':
      return skewer(c, t);
    case 'discovered-attack':
      return discovered(c, t);
    case 'trapped-piece':
      return trapped(c, t);
    case 'remove-defender':
      return removeDefender(c, t);
    case 'checkmate':
      return checkmate(c, t);
    case 'mate-threat':
      return mateThreat(c, t);
    default:
      return null;
  }
}

const mark = (square: Square, tone: Tone): Mark => ({ square, tone });
const marks = (squares: Square[], tone: Tone): Mark[] => squares.map((square) => mark(square, tone));
const arrow = (from: Square, to: Square, tone: ArrowTone): Arrow => ({ from, to, tone });
const moveArrow = (move: Move, tone: ArrowTone): Arrow => arrow(move.from, move.to, tone);
const count = (n: number) => [...COUNT, ...MORE][n] ?? String(n);
const bare = (san: string) => san.replace(/[+#]$/, '');

function guardVerb(n: number): string {
  return n === 1 ? 'guards' : 'guard';
}

/** The pieces that still stand where the theme says, on `fen`. */
function standing(fen: string, pieces: ThemePiece[]): ThemePiece[] {
  const board = new Chess(fen);
  const seen = new Set<Square>();
  return pieces.filter((p) => {
    const there = board.get(p.square);
    if (seen.has(p.square) || there?.type !== p.type || there.color !== p.color) return false;
    seen.add(p.square);
    return true;
  });
}

function bestMove(c: Context): Move | undefined {
  return playLine(c.fen, c.turn.lines.best?.slice(0, 1) ?? [])[0];
}

/** What a beat that asks for `move` adds to itself. */
function asking(ask: string, move: Move): Pick<Beat, 'ask' | 'answer'> {
  return { ask, answer: uciOf(move) };
}

/**
 * The line goes on from where the steps left the board, or from the start when they left the line.
 * After a template it says where the line ends up; otherwise it gives the idea the pointing left out.
 */
function lineBeat(c: Context, last: Beat | undefined, taught: boolean): Beat {
  const text = taught ? resultText(c) : ideaOf(c.theme, c.user, { fen: c.fen, best: c.turn.lines.best?.[0] });
  const line = c.shown.map(uciOf);
  const reached = last && (last.answer ? playLine(last.fen, [last.answer])[0]?.after : last.fen);
  const played = line.findIndex((_, i) => samePlace(fenAfter(c.fen, line.slice(0, i + 1)), reached));
  if (played < 0) return { fen: c.fen, text, marks: [], arrows: [], line };
  return { fen: reached!, text, marks: [], arrows: [], line: line.slice(played + 1) };
}

function fenAfter(fen: string, ucis: string[]): string {
  return playLine(fen, ucis).at(-1)?.after ?? fen;
}

/** Same pieces, same side to move. */
function samePlace(a: string, b: string | undefined): boolean {
  return b !== undefined && a.split(' ').slice(0, 2).join(' ') === b.split(' ').slice(0, 2).join(' ');
}

/** Where the shown line leaves the material, or the mate it ends in. */
function resultText(c: Context): string {
  const last = c.shown.at(-1);
  if (last?.san.endsWith('#')) {
    if (last.color !== c.user) return `The line ends with ${c.them} giving checkmate.`;
    return c.shown.length === 1 ? 'Checkmate: the game is over.' : 'The line ends in checkmate.';
  }
  const trade = tradeOf(c.shown, c.user);
  const end = 'By the end of the line,';
  if (trade.net > 0) return `${end} you have ${isWin(c.theme) ? '' : 'even '}won ${netText(trade)}.`;
  if (trade.net === 0) return `${end} material is level${trade.won.length ? ' after the trades' : ''}.`;
  return `${end} you have given up ${tradeText({ ...trade, won: trade.lost, lost: trade.won, promoted: [] })}.`;
}

/** The theme's pieces ringed, when no template fits. */
function lookAt(c: Context): Beat[] {
  const pieces = standing(c.fen, c.theme.pieces);
  if (!pieces.length) return [];
  const text = `Look at ${listOf(pieces.map(c.ref))}.`;
  return [{ fen: c.fen, text, marks: marks(pieces.map((p) => p.square), 'focus'), arrows: [] }];
}

function freePiece(c: Context, t: Of<'free-piece'>): Beat[] | null {
  const take = t.moves[0];
  const target = t.won;
  if (!target) return null;
  const board = new Chess(c.fen);
  const side = lineUp(board, target.square, c.user);
  const guards = lineUp(board, target.square, target.color);
  const seen = [mark(target.square, 'focus'), ...marks(side.squares, 'good'), ...marks(guards.squares, 'bad')];
  return [
    { fen: c.fen, text: freeReason(c, t, board, side, guards), marks: seen, arrows: [], claims: [...side.claims, ...guards.claims] },
    {
      fen: c.fen,
      text: freeWin(c, t),
      marks: [mark(target.square, 'focus')],
      arrows: [moveArrow(take, 'best')],
      ...asking(`Your move: take the ${NAME[target.type]}.`, take),
    },
  ];
}

/** The pieces of one side that bear on a square: those attacking it, then those lined up behind them. */
interface LineUp {
  attackers: Square[];
  behind: Backer[];
  squares: Square[];
  claims: Claim[];
}

function lineUp(board: Chess, square: Square, color: Color): LineUp {
  const attackers = board.attackers(square, color);
  const behind = backers(board, square, color);
  const own = board.get(square)?.color === color;
  const claims: Claim[] = [
    own ? { claim: 'guards', square, squares: attackers } : { claim: 'attackers', square, squares: attackers },
    ...behind.map((b): Claim => ({ claim: 'backs', square: b.square, front: b.front, target: square })),
  ];
  return { attackers, behind, squares: [...attackers, ...behind.map((b) => b.square)], claims };
}

/** "your knight on c3", "your bishop on e7 and your queen behind it", or for more than two "three of your pieces". */
function lineUpText(c: Context, board: Chess, side: LineUp): string {
  const mine = side.attackers.some((s) => board.get(s)?.color === c.user);
  if (side.squares.length > 2) return `${count(side.squares.length)} ${mine ? 'of your' : 'enemy'} pieces`;
  const named = side.attackers.flatMap((square) => {
    const piece = pieceOn(board, square)!;
    const back = side.behind.filter((b) => b.front === square);
    return [c.ref(piece), ...back.map((b) => `${b.color === c.user ? 'your' : 'the'} ${NAME[b.type]} behind it`)];
  });
  return listOf(named);
}

function freeReason(c: Context, t: Of<'free-piece'>, board: Chess, side: LineUp, guards: LineUp): string {
  const piece = c.ref(t.won!);
  const who = capitalize(lineUpText(c, board, side));
  const hit = side.squares.length === 1 ? 'attacks' : 'attack';
  if (!guards.squares.length) return `${who} ${hit} ${piece}, and nothing guards it.`;
  if (t.reason === 'cheaper') return `${capitalize(piece)} is guarded, but it is worth more than your ${NAME[t.moves[0].piece]}.`;
  const n = guards.squares.length;
  const guarding = n === 1 ? lineUpText(c, board, guards) : `${count(n)} pieces`;
  if (side.squares.length > n) return `${who} ${hit} ${piece}, and only ${guarding} ${guardVerb(n)} it.`;
  return `${capitalize(piece)} is not guarded well enough.`;
}

/** Why the capture wins the piece, and the pieces the capturing piece hits next; the line's result comes at the end. */
function freeWin(c: Context, t: Of<'free-piece'>): string {
  const take = t.moves[0];
  const wins = { undefended: 'it for free', cheaper: `it, even if ${c.them} takes back`, outnumbered: 'it' }[t.reason];
  // What the capturing piece hits next only matters if it can stay there.
  const stays = !isLoose(take.after, take.to);
  const next = stays ? attackedTargets(new Chess(take.after), take.to, take.piece, c.user).filter((p) => p.type !== 'k') : [];
  const also = next.length ? ` From ${take.to}, it also attacks ${listOf(next.map((p) => c.ref({ ...p, color: otherColor(c.user) })))}.` : '';
  return `So ${take.san} wins ${wins}.${also}`;
}

function hangingOwn(c: Context, t: Tactic): Beat[] | null {
  const take = t.moves[0];
  const mine = t.won;
  if (!mine || t.at !== 0 || !standing(c.fen, [{ ...mine, role: 'target' }]).length) return null;
  const board = new Chess(c.fen);
  const attacker = pieceOn(board, take.from)!;
  const hit = [mine, ...alsoHit(board, attacker, mine)];
  const guards = board.attackers(mine.square, c.user).filter((s) => !hit.some((p) => p.square === s));
  const attackers = board.attackers(mine.square, otherColor(c.user));
  const forked = hit.length > 1;
  const danger: Beat = {
    fen: c.fen,
    text: forked ? `${capitalize(c.ref(attacker))} attacks ${listOf(hit.map(c.ref))}.` : dangerText(c, t, board, take),
    marks: [...marks(hit.map((p) => p.square), 'bad'), ...marks(guards, 'good')],
    arrows: forked ? hit.map((p) => arrow(attacker.square, p.square, 'threat')) : attackers.map((from) => arrow(from, mine.square, 'threat')),
    claims: forked
      ? [{ claim: 'attacks', square: attacker.square, squares: hit.map((p) => p.square) }]
      : [
          { claim: 'attackers', square: mine.square, squares: attackers },
          { claim: 'guards', square: mine.square, squares: guards },
        ],
  };
  const best = bestMove(c);
  if (!best) return [danger];
  const save = saveText(c, hit, attacker, best);
  return [
    danger,
    { fen: c.fen, text: save.text, marks: [mark(mine.square, 'focus')], arrows: [moveArrow(best, 'best')], ...asking(save.ask, best) },
  ];
}

/** The user's other pieces the attacker hits at the same time: bigger than it, or loose. */
function alsoHit(board: Chess, attacker: PieceAt, mine: PieceAt): PieceAt[] {
  return attackedTargets(board, attacker.square, attacker.type, attacker.color)
    .filter((p) => p.type !== 'k' && p.square !== mine.square)
    .map((p) => ({ ...p, color: mine.color }));
}

function dangerText(c: Context, t: Tactic, board: Chess, take: Move): string {
  const mine = t.won!;
  const piece = c.ref(mine);
  const by = c.ref(pieceOn(board, take.from)!);
  const attackers = lineUp(board, mine.square, otherColor(c.user));
  const guards = lineUp(board, mine.square, c.user);
  if (!guards.squares.length) return `${capitalize(piece)} is attacked by ${by}, and nothing guards it.`;
  if (t.id === 'free-piece' && t.reason === 'cheaper') return `${capitalize(piece)} is attacked by ${by}, which is worth less.`;
  const n = guards.squares.length;
  if (attackers.squares.length > n) {
    const guarding = n === 1 ? lineUpText(c, board, guards) : count(n);
    return `${capitalize(lineUpText(c, board, attackers))} attack ${piece}, and only ${guarding} ${guardVerb(n)} it.`;
  }
  return `${capitalize(piece)} is attacked by ${by}, and it is not guarded well enough.`;
}

/** "moves your queen to safety", "trades it for the knight", "moves it away, taking a pawn". */
function movesAway(best: Move, piece: string): string {
  const safe = !isLoose(best.after, best.to);
  if (!best.captured) return `moves ${piece} ${safe ? 'to safety' : 'away'}`;
  if (!safe && VALUE[best.captured] >= VALUE[best.piece]) return `trades ${piece} for the ${NAME[best.captured]}`;
  return `moves ${piece} ${safe ? 'to safety' : 'away'}, taking ${takenText(best.captured)}`;
}

/** What the best move does for the pieces in danger (`hit`, the one the line wins first), and how. */
function saveText(c: Context, hit: PieceAt[], attacker: PieceAt, best: Move): { text: string; ask: string } {
  const [mine] = hit;
  const name = NAME[mine.type];
  const it = hit.length > 1 ? `your ${name}` : 'it';
  if (best.to === attacker.square && best.captured) return { text: `${best.san} takes the attacker.`, ask: 'Your move: take the attacker.' };
  const moved = hit.find((p) => p.square === best.from);
  if (moved) {
    const away = movesAway(best, hit.length > 1 ? `your ${NAME[moved.type]}` : 'it');
    const rest = hit.filter((p) => p !== moved);
    const safe = rest.length && rest.every((p) => !isLoose(best.after, p.square));
    const kept = safe ? `, and ${listOf(rest.map(c.ref))} ${rest.length > 1 ? 'stay' : 'stays'} guarded` : '';
    const ask = away.startsWith('trades') ? 'Your move: trade it off.' : `Your move: save your ${NAME[moved.type]}.`;
    return { text: `${best.san} ${away}${kept}.`, ask };
  }
  if (isBetween(attacker.square, best.to, mine.square)) return { text: `${best.san} blocks the line from ${c.ref(attacker)}.`, ask: 'Your move: block it.' };
  if (best.san.includes('+')) return { text: `${best.san} comes first: it gives check.`, ask: 'Your move: give check.' };
  const guards = (fen: string) => new Chess(fen).attackers(mine.square, mine.color).length;
  if (guards(best.after) > guards(best.before) && !isLoose(best.after, mine.square)) {
    return { text: `${best.san} guards ${it}.`, ask: `Your move: guard your ${name}.` };
  }
  const behind = pinnedBehind(best, attacker.square);
  if (behind) {
    const back = behind.type === 'k' ? 'the king' : c.ref(behind);
    return { text: `${best.san} pins ${c.ref(attacker)} to ${back}, so it can't take safely.`, ask: 'Your move: pin the attacker.' };
  }
  if (new Chess(best.after).attackers(attacker.square, c.user).includes(best.to)) {
    return { text: `${best.san} hits back at ${c.ref(attacker)}, which threatens your ${name}.`, ask: 'Your move: attack the attacker.' };
  }
  const does = purpose(best, c.user);
  return { text: does.length ? `${best.san} ${listOf(does)}.` : `The best answer is ${best.san}.`, ask: 'Your move: play it.' };
}

/** The bigger piece the moved slider pins the piece on `square` to, if the move makes such a pin. */
function pinnedBehind(move: Move, square: Square): PieceAt | null {
  const direction = directionTo(move.to, square);
  if (!direction || !slidesAlong(move.piece, direction)) return null;
  const [front, back] = piecesAlong(new Chess(move.after), move.to, direction);
  if (front?.square !== square || back?.color !== front.color) return null;
  return back.type === 'k' || VALUE[back.type] > VALUE[front.type] ? back : null;
}

function threatOther(c: Context, t: Tactic): Beat[] {
  const threat = t.moves[0];
  const hit = marks(
    standing(c.fen, c.theme.pieces.filter((p) => p.color === c.user)).map((p) => p.square),
    'bad',
  );
  const text = ideaOf(c.theme, c.user, { fen: c.fen, best: c.turn.lines.best?.[0] });
  const warn: Beat = { fen: c.fen, text, marks: hit, arrows: [moveArrow(threat, 'threat')] };
  const best = bestMove(c);
  if (!best) return [warn];
  const answer = stopText(c.fen, best, t, c.user);
  const against = answer.against && !hit.some((m) => m.square === answer.against!.square) ? [mark(answer.against.square, 'focus')] : [];
  return [
    warn,
    {
      fen: c.fen,
      text: `${answer.text}.`,
      marks: [...hit, ...against],
      arrows: [moveArrow(best, 'best')],
      ...asking('Your move: stop the threat.', best),
    },
  ];
}

function bait(c: Context, t: Tactic): Beat[] | null {
  const lure = c.theme.bait?.move;
  if (!lure) return null;
  const reasons = appeal(lure, c.user);
  const free = looksFree(lure) ? ', and it looks free' : '';
  const looks = reasons.length ? `${lure.san} is tempting: it ${listOf(reasons)}${free}.` : `${lure.san} looks quiet and safe.`;
  const reply = t.moves[0];
  const hit = standing(lure.after, c.theme.pieces.filter((p) => p.color === c.user && p.role !== 'mover'));
  const beats: Beat[] = [
    { fen: c.fen, text: looks, marks: [], arrows: [moveArrow(lure, 'mistake')] },
    {
      fen: lure.after,
      move: uciOf(lure),
      text: t.id === 'checkmate' && t.key === 0 ? mateAllowed(c, lure, reply) : punished(c, t),
      marks: marks(hit.map((p) => p.square), 'bad'),
      arrows: [moveArrow(reply, 'threat')],
    },
  ];
  const best = bestMove(c);
  if (!best || best.san === lure.san) return beats;
  const does = purpose(best, c.user);
  const instead = does.length ? `Instead, ${best.san} ${listOf(does)}.` : `Instead, play ${best.san}.`;
  return [...beats, { fen: c.fen, text: instead, marks: [], arrows: [moveArrow(best, 'best')], ...asking('Your move: play it.', best) }];
}

/** "But it opens the line from the rook on a8 to your queen on a1, and Rxa1 wins it." */
function punished(c: Context, t: Tactic): string {
  const opened = c.theme.bait?.opened;
  if (!opened || !t.won || t.key !== 0) return `But ${replyText(t, c.user)}.`;
  return `But it opens the line from ${c.ref(opened)} to ${c.ref(t.won)}, and ${t.moves[0].san} wins it.`;
}

/** "But it opens the line from the queen on d3 to h7, and Qxh7 is checkmate." */
function mateAllowed(c: Context, lure: Move, mate: Move): string {
  const before = new Chess(lure.before);
  const mater = pieceOn(before, mate.from);
  const target = mate.to;
  const king = kingOf(new Chess(mate.after), c.user).square;
  const opened = mater && [target, king].some((s) => isBetween(mate.from, lure.from, s) && slidesAlong(mater.type, directionTo(mate.from, s)!));
  if (opened) return `But it opens the line from ${c.ref(mater)} to ${target}, and ${bare(mate.san)} is checkmate.`;
  const guarded = (fen: string, from: Square) => new Chess(fen).attackers(target, c.user).includes(from);
  if (guarded(lure.before, lure.from) && !guarded(lure.after, lure.to)) {
    return `But your ${NAME[lure.piece]} no longer guards ${target}, and ${bare(mate.san)} is checkmate.`;
  }
  return `But ${bare(mate.san)} is checkmate.`;
}

function fork(c: Context, t: Of<'fork'>): Beat[] {
  const move = t.moves[0];
  const piece = pieceOn(new Chess(c.fen), move.from)!;
  const targets = t.targets;
  const king = targets.find((p) => p.type === 'k');
  const others = listOf(targets.filter((p) => p.type !== 'k').map(c.ref));
  const hits = king ? `check the king and attack ${others}` : `attack ${others}`;
  return [
    {
      fen: c.fen,
      text: `From ${move.to}, ${c.ref(piece)} would ${hits}.`,
      marks: [...marks(targets.map((p) => p.square), 'focus'), mark(move.from, 'good')],
      arrows: [moveArrow(move, 'best')],
      ...asking('Your move: play the fork.', move),
    },
    {
      fen: move.after,
      move: uciOf(move),
      text: forkPunch(c, t),
      marks: marks(targets.map((p) => p.square), 'bad'),
      arrows: targets.map((p) => arrow(move.to, p.square, 'threat')),
      claims: [{ claim: 'attacks', square: move.to, squares: targets.map((p) => p.square) }],
    },
  ];
}

function forkPunch(c: Context, t: Of<'fork'>): string {
  const won = t.targets.find((p) => p.square === t.won?.square);
  if (t.targets.some((p) => p.type === 'k')) {
    return won ? `${c.them} must answer the check, so ${c.ref(won)} falls.` : `${c.them} must answer the check and loses material.`;
  }
  if (!won) return `${c.them} can't avoid losing material.`;
  return t.targets.length > 2 ? `${c.them} can't save them all.` : 'Only one of them can be saved.';
}

/** "on the e-file", "on the same rank", "on the same diagonal". */
function lineName(a: Square, b: Square): string {
  if (a[0] === b[0]) return `on the ${a[0]}-file`;
  return a[1] === b[1] ? 'on the same rank' : 'on the same diagonal';
}

/** Whether nothing stands between the pieces on `a` and `b`, which share a line. */
function nextOnLine(board: Chess, a: Square, b: Square): boolean {
  const direction = directionTo(a, b);
  return direction !== null && piecesAlong(board, a, direction)[0]?.square === b;
}

function pinCreated(c: Context, t: Of<'pin'>): Beat[] | null {
  const move = t.moves[0];
  const { pinner, pinned, behind } = t.pin;
  if (!nextOnLine(new Chess(c.fen), pinned.square, behind.square)) return null;
  const pair = [mark(pinned.square, 'focus'), mark(behind.square, 'focus')];
  const back = behind.type === 'k' ? 'the king' : c.ref(behind);
  const lost = t.won?.square === pinned.square ? ` ${c.them} can't save it.` : '';
  const slides = new Chess(move.after).moves({ square: pinned.square }).length > 0;
  const stuck =
    behind.type !== 'k' ? `If it moves, ${back} falls.` : `It ${slides ? 'can only move along that line' : "can't move"}: the king is behind it.${lost}`;
  return [
    {
      fen: c.fen,
      text: `${capitalize(c.ref(pinned))} stands in front of ${back}, ${lineName(pinned.square, behind.square)}.`,
      marks: pair,
      arrows: [],
      claims: [{ claim: 'in-line', squares: [pinned.square, behind.square] }],
    },
    {
      fen: c.fen,
      text: `${move.san} ${move.captured ? `takes ${takenText(move.captured)} and ` : ''}puts your ${NAME[pinner.type]} on that line.`,
      marks: pair,
      arrows: [moveArrow(move, 'best')],
      ...asking('Your move: pin it.', move),
    },
    {
      fen: move.after,
      move: uciOf(move),
      text: stuck,
      marks: [mark(pinned.square, 'bad'), mark(behind.square, 'focus')],
      arrows: [arrow(pinner.square, behind.square, 'threat')],
      claims: [{ claim: 'pin', square: pinned.square, pinner: pinner.square, behind: behind.square }],
    },
  ];
}

function pinExploited(c: Context, t: Of<'pin'>): Beat[] | null {
  const move = t.moves[0];
  const { pinner, pinned, behind } = t.pin;
  const back = behind.type === 'k' ? 'the king' : c.ref(behind);
  const held = pinOn(new Chess(c.fen), pinned.square);
  if (held?.pinner.square !== pinner.square || held.behind.square !== behind.square) return pinOpened(c, t, back);
  return [
    {
      fen: c.fen,
      text: `${capitalize(c.ref(pinned))} is pinned to ${back} by ${c.ref(pinner)}.`,
      marks: [mark(pinner.square, 'good'), mark(pinned.square, 'focus'), mark(behind.square, 'focus')],
      arrows: [arrow(pinner.square, behind.square, 'threat')],
      claims: [{ claim: 'pin', square: pinned.square, pinner: pinner.square, behind: behind.square }],
    },
    {
      fen: c.fen,
      text: pinUse(c, t, back),
      marks: [mark(pinned.square, 'focus')],
      arrows: [moveArrow(move, 'best')],
      ...asking('Your move: use the pin.', move),
    },
  ];
}

/** A pin the move itself makes by stepping off the line between the pinner and the pinned piece. */
function pinOpened(c: Context, t: Of<'pin'>, back: string): Beat[] | null {
  const move = t.moves[0];
  const { pinner, pinned, behind } = t.pin;
  if (!isBetween(pinner.square, move.from, pinned.square)) return null;
  const takes = move.captured ? `takes ${takenText(move.captured)} and ` : '';
  return [
    {
      fen: c.fen,
      text: `${move.san} ${takes}opens the line from ${c.ref(pinner)} to ${c.ref(pinned)}.`,
      marks: [mark(pinner.square, 'good'), mark(pinned.square, 'focus'), mark(behind.square, 'focus')],
      arrows: [moveArrow(move, 'best')],
      ...asking(`Your move: play ${move.san}.`, move),
    },
    {
      fen: move.after,
      move: uciOf(move),
      text: `Now ${c.ref(pinned)} is pinned to ${back}.${pinnedNow(c, t, back)}`,
      marks: [mark(pinned.square, 'bad'), mark(behind.square, 'focus')],
      arrows: [arrow(pinner.square, behind.square, 'threat')],
      claims: [{ claim: 'pin', square: pinned.square, pinner: pinner.square, behind: behind.square }],
    },
  ];
}

/** What the pin just opened stops: taking back, or moving at all. */
function pinnedNow(c: Context, t: Of<'pin'>, back: string): string {
  const king = t.pin.behind.type === 'k';
  const square = t.moves[0].to;
  if (t.how === 'defender') return king ? ` It can't take back on ${square}.` : ` It can't take back on ${square} without losing ${back}.`;
  if (t.how === 'opened') return king ? ` ${c.them} can't save it.` : ` If it moves, ${back} falls.`;
  return '';
}

function pinUse(c: Context, t: Of<'pin'>, back: string): string {
  const san = t.moves[0].san;
  switch (t.how) {
    case 'attacked': {
      const taken = t.moves[0].captured;
      return `So ${san} ${taken ? `takes ${takenText(taken)} and ` : ''}attacks it. It can't run.`;
    }
    case 'defender': {
      const taken = t.moves[0].captured;
      const wins = t.key === 0 && taken ? takenText(taken) : 'material';
      const why = t.pin.behind.type === 'k' ? "can't take back" : `can't take back without losing ${back}`;
      return `So ${san} wins ${wins}: ${c.ref(t.pin.pinned)} ${why}.`;
    }
    default: {
      const wins = `${t.moves[t.key].san} wins ${back}`;
      return t.key > SHORT_LEAD ? `So when it moves away, ${wins}.` : `So after ${sequence(t.moves.slice(0, t.key))}, ${wins}.`;
    }
  }
}

function skewer(c: Context, t: Of<'skewer'>): Beat[] | null {
  const move = t.moves[0];
  const { front, back } = t;
  if (!nextOnLine(new Chess(c.fen), front.square, back.square)) return null;
  const king = front.type === 'k';
  const first = king ? 'The king' : capitalize(c.ref(front));
  const steps = king ? 'When the king steps aside' : `When the ${NAME[front.type]} steps aside`;
  const hitsFront = `attacks the ${NAME[front.type]}`;
  return [
    {
      fen: c.fen,
      text: `${first} and ${c.ref(back)} stand ${lineName(front.square, back.square)}.`,
      marks: [mark(front.square, 'focus'), mark(back.square, 'focus')],
      arrows: [],
      claims: [{ claim: 'in-line', squares: [front.square, back.square] }],
    },
    {
      fen: c.fen,
      text: `${move.san} ${move.captured ? `takes ${takenText(move.captured)} and ` : ''}${king ? 'gives check' : hitsFront} along that line.`,
      marks: [mark(front.square, 'focus'), mark(back.square, 'focus')],
      arrows: [moveArrow(move, 'best')],
      ...asking('Your move: play the skewer.', move),
    },
    {
      fen: move.after,
      move: uciOf(move),
      text: `${steps}, you take ${c.ref(back)} behind it.`,
      marks: [mark(front.square, 'focus'), mark(back.square, 'bad')],
      arrows: [arrow(move.to, front.square, 'threat')],
      claims: [
        { claim: 'attacks', square: move.to, squares: [front.square] },
        { claim: 'in-line', squares: [front.square, back.square] },
      ],
    },
  ];
}

function discovered(c: Context, t: Of<'discovered-attack'>): Beat[] {
  const move = t.moves[0];
  const { slider, target } = t;
  const mover = pieceOn(new Chess(c.fen), move.from)!;
  const toTarget = target.type === 'k' ? 'the king' : c.ref(target);
  const before = [mark(move.from, 'focus'), mark(slider.square, 'good'), mark(target.square, 'bad')];
  const hit = moverThreat(c, move, target);
  const hits = hit ? [hit] : [];
  const moves = `${move.san} ${move.captured ? `takes ${takenText(move.captured)} and ` : ''}moves it out of the way.`;
  return [
    {
      fen: c.fen,
      text: `${capitalize(c.ref(mover))} blocks the line from ${c.ref(slider)} to ${toTarget}.`,
      marks: before,
      arrows: [],
      claims: [{ claim: 'blocks', square: move.from, from: slider.square, to: target.square }],
    },
    { fen: c.fen, text: moves, marks: before, arrows: [moveArrow(move, 'best')], ...asking(`Your move: move the ${NAME[mover.type]}.`, move) },
    {
      fen: move.after,
      move: uciOf(move),
      text: twoAttacks(c, t, move, hit),
      marks: [mark(target.square, 'bad'), ...marks(hits.map((p) => p.square), 'bad')],
      arrows: [arrow(slider.square, target.square, 'threat'), ...hits.map((p) => arrow(move.to, p.square, 'threat'))],
      claims: [
        { claim: 'attacks', square: slider.square, squares: [target.square] },
        ...(hit ? [{ claim: 'attacks' as const, square: move.to, squares: [hit.square] }] : []),
      ],
    },
  ];
}

/** The moved piece's own threat: a check, else the biggest piece it now attacks, guarded or not. */
function moverThreat(c: Context, move: Move, target: PieceAt): PieceAt | null {
  const after = new Chess(move.after);
  const enemy = otherColor(c.user);
  const hitByMover = (p: PieceAt) => p.square !== target.square && p.type !== 'p' && after.attackers(p.square, c.user).includes(move.to);
  const hits = piecesOf(after, enemy).filter(hitByMover);
  const worth = (p: PieceAt) => (p.type === 'k' ? Infinity : VALUE[p.type]);
  const hit = hits.sort((a, b) => worth(b) - worth(a))[0];
  // A guarded piece worth less than the mover is no threat.
  return hit && (hit.type === 'k' || VALUE[hit.type] >= VALUE[move.promotion ?? move.piece] || isLoose(move.after, hit.square)) ? hit : null;
}

/** How many pieces give check in the position. */
function checkers(chess: Chess): number {
  return chess.attackers(kingOf(chess, chess.turn()).square, otherColor(chess.turn())).length;
}

function twoAttacks(c: Context, t: Of<'discovered-attack'>, move: Move, hit: PieceAt | null): string {
  const after = new Chess(move.after);
  const slider = `Your ${NAME[t.slider.type]}`;
  const mover = `your ${NAME[move.promotion ?? move.piece]}`;
  if (checkers(after) > 1) {
    const safe = !after.moves({ verbose: true }).some((m) => m.to === move.to);
    return `Double check: ${slider.toLowerCase()} and ${mover} both give check, so the king must move${safe ? ` and nothing can take ${mover}` : ''}.`;
  }
  const king = t.target.type === 'k';
  const opened = king ? `${slider} gives check` : `${slider} now attacks ${c.ref(t.target)}`;
  if (hit) return `${opened}, and ${mover} ${hit.type === 'k' ? 'gives check' : `attacks ${c.ref(hit)}`}. Two attacks at once.`;
  if (king) return move.captured ? `${opened}, so ${c.them} must answer the check first.` : `${opened}.`;
  if (move.captured) return `${opened}, so ${c.them} can't take back on ${move.to} and save it too.`;
  return cornered(after, t.target.square) ? `${opened}, and it has no safe square to go to.` : `${opened}.`;
}

/** The piece on `square` has no move that keeps it safe. */
function cornered(after: Chess, square: Square): boolean {
  return after.moves({ square, verbose: true }).every(escapeFails);
}

/** An escape fails when the piece can still be won on its new square. */
function escapeFails(escape: Move): boolean {
  const taken = escape.captured ? VALUE[escape.captured] : 0;
  return exchangeGain(new Chess(escape.after), escape.to) - taken > 0;
}

function trapped(c: Context, t: Of<'trapped-piece'>): Beat[] | null {
  const move = t.moves[0];
  const piece = t.trapped;
  const probe = passTurn(c.fen);
  if (!probe) return null;
  const escapes = new Chess(probe).moves({ square: piece.square, verbose: true });
  const squares = [...new Set(escapes.map((m) => m.to))];
  const covered = [...new Set(escapes.filter(escapeFails).map((m) => m.to))];
  const open = squares.filter((s) => !covered.includes(s));
  return [
    {
      fen: c.fen,
      text: squaresText(c.ref(piece), squares.length, covered.length),
      marks: [mark(piece.square, 'focus'), ...marks(covered, 'bad'), ...marks(open, 'hint')],
      arrows: [],
      claims: [{ claim: 'escape-squares', square: piece.square, squares, covered }],
    },
    {
      fen: c.fen,
      text: trapText(c, t),
      marks: [mark(piece.square, 'focus')],
      arrows: [moveArrow(move, 'best')],
      ...asking(`Your move: trap the ${NAME[piece.type]}.`, move),
    },
  ];
}

function squaresText(piece: string, n: number, covered: number): string {
  const lead = `Count the squares of ${piece}:`;
  if (n === 0) return `${lead} it has none.`;
  if (covered === n) return `${lead} it has ${count(n)}, and ${n === 1 ? 'it is' : n === 2 ? 'both are' : 'every one is'} covered.`;
  return `${lead} it has ${count(n)}, and ${count(covered)} ${covered === 1 ? 'is' : 'are'} covered.`;
}

/** What the move does to the trapped piece and its squares, counted once the move is played. */
function trapText(c: Context, t: Of<'trapped-piece'>): string {
  const move = t.moves[0];
  const square = t.trapped.square;
  const after = new Chess(move.after);
  const escapes = after.moves({ square, verbose: true });
  const end = escapes.length ? 'it has nowhere safe to go' : 'it has nowhere to go';
  const name = `the ${NAME[t.trapped.type]}`;
  const opener = openedOnto(c, move, [square, ...escapes.map((m) => m.to)]);
  const does = [
    move.captured ? `takes ${takenText(move.captured)}` : '',
    after.attackers(square, c.user).includes(move.to) ? `attacks ${name}` : '',
    opener ? `opens ${lineThrough(opener.square, move.from)} for ${c.ref(opener)}` : '',
  ].filter(Boolean);
  if (!does.length) return `After ${move.san}, ${name} can be won, and ${end}.`;
  return `${move.san} ${listOf(does)}, so ${end}.`;
}

/** A slider of the user's that the move lets through to one of `squares` by leaving the line. */
function openedOnto(c: Context, move: Move, squares: Square[]): PieceAt | null {
  const [before, after] = [new Chess(move.before), new Chess(move.after)];
  for (const square of squares) {
    const from = after
      .attackers(square, c.user)
      .find((s) => s !== move.to && !before.attackers(square, c.user).includes(s) && isBetween(s, move.from, square));
    if (from) return pieceOn(after, from);
  }
  return null;
}

function removeDefender(c: Context, t: Of<'remove-defender'>): Beat[] {
  const move = t.moves[0];
  const { defender, guarded } = t;
  const board = new Chess(c.fen);
  const guards = board.attackers(guarded.square, guarded.color);
  const side = lineUp(board, guarded.square, c.user);
  const who = `${capitalize(lineUpText(c, board, side))} ${side.squares.length === 1 ? 'attacks' : 'attack'} ${c.ref(guarded)}`;
  const only =
    guards.length === 1
      ? `${who}, and only ${c.ref(defender)} guards it.`
      : `${who}, and ${count(guards.length)} pieces guard it, ${c.ref(defender)} among them.`;
  const beats: Beat[] = [
    {
      fen: c.fen,
      text: only,
      marks: [mark(guarded.square, 'focus'), ...marks(side.squares, 'good')],
      arrows: [arrow(defender.square, guarded.square, 'mistake')],
      claims: [{ claim: 'guards', square: guarded.square, squares: guards }, ...side.claims],
    },
    {
      fen: c.fen,
      text: `${move.san} ${removeVerb(t)}.`,
      marks: [mark(defender.square, 'focus')],
      arrows: [moveArrow(move, 'best'), arrow(defender.square, guarded.square, 'mistake')],
      ...asking(`Your move: ${REMOVE_ASKS[t.how]} the ${NAME[defender.type]}${t.how === 'capture' ? '' : ' away'}.`, move),
    },
  ];
  const hangs = hangsAfterReply(c, t);
  return hangs ? [...beats, hangs] : beats;
}

const REMOVE_ASKS = { capture: 'take', chase: 'chase', deflect: 'lure' };

/** "trades off the knight", "takes a pawn and chases the knight away". */
function removeVerb(t: Of<'remove-defender'>): string {
  const move = t.moves[0];
  const guard = `the ${NAME[t.defender.type]}`;
  // A guard lured into taking back on the same square is a trade of like pieces.
  const trade = t.how === 'deflect' && move.captured === move.piece;
  const takes = move.captured ? `${trade ? `trades ${NAME[move.piece]}s` : `takes ${takenText(move.captured)}`} and ` : '';
  if (t.how === 'chase') return `${takes}chases ${guard} away`;
  if (t.how === 'deflect') return `${takes}lures ${guard} away`;
  return t.moves[1]?.to === move.to ? `trades off ${guard}` : `takes ${guard}`;
}

/** The position after the reply, when the guarded piece can be taken next move. */
function hangsAfterReply(c: Context, t: Of<'remove-defender'>): Beat | null {
  const reply = t.moves[1];
  const take = t.moves[t.key];
  if (!reply || t.key !== 2) return null;
  const square = t.guarded.square;
  const free = new Chess(reply.after).attackers(square, t.guarded.color).length === 0;
  if (!free && !isLoose(reply.after, square)) return null;
  // Taking back can pull a second guard away too.
  const guarding = (fen: string, from: Square) => new Chess(fen).attackers(square, t.guarded.color).includes(from);
  const pulled = reply.from !== t.defender.square && guarding(reply.before, reply.from) && !guarding(reply.after, reply.to);
  const lead = pulled ? `Taking back pulls ${c.ref(pieceOn(new Chess(reply.before), reply.from)!)} away from it too. ` : '';
  return {
    fen: reply.after,
    move: uciOf(reply),
    text: `${lead}${free ? `Now nothing guards it, and ${take.san} wins it.` : `Now it hangs, and ${take.san} wins it.`}`,
    marks: [mark(square, 'bad')],
    arrows: [moveArrow(take, 'best')],
    claims: [{ claim: free ? 'undefended' : 'hangs', square }],
  };
}

interface Box {
  blocked: Square[];
  covered: Square[];
  free: Square[];
}

/** The squares around the king: its own pieces stand on them, the other side attacks them, or they are free. */
function boxOf(board: Chess, king: PieceAt): Box {
  const box: Box = { blocked: [], covered: [], free: [] };
  for (const square of around(king.square)) {
    if (board.get(square)?.color === king.color) box.blocked.push(square);
    else if (board.attackers(square, otherColor(king.color)).length) box.covered.push(square);
    else box.free.push(square);
  }
  return box;
}

function around(square: Square): Square[] {
  const file = square.charCodeAt(0);
  const rank = Number(square[1]);
  const squares: Square[] = [];
  for (const df of [-1, 0, 1]) {
    for (const dr of [-1, 0, 1]) {
      const f = file + df;
      const r = rank + dr;
      if ((df || dr) && f >= 97 && f <= 104 && r >= 1 && r <= 8) squares.push(`${String.fromCharCode(f)}${r}` as Square);
    }
  }
  return squares;
}

function boxText(board: Chess, box: Box): string {
  const own = box.blocked.map((s) => board.get(s)!.type);
  const kind = own.every((type) => type === 'p') ? 'pawns' : own.includes('p') ? 'pawns and pieces' : 'pieces';
  const n = box.free.length;
  if (n) {
    const free = `only ${listOf(box.free)} ${n === 1 ? 'is' : 'are'} free`;
    return own.length > box.covered.length ? `Its own ${kind} box the king in: ${free}.` : `The king is short of squares: ${free}.`;
  }
  if (!box.covered.length) return `The king is boxed in by its own ${kind}.`;
  if (!own.length) return 'Your pieces cover every square around the king.';
  return `The king has no free square: its own ${kind} block ${count(own.length)}, and your pieces cover ${count(box.covered.length)}.`;
}

function kingBox(fen: string, color: Color): { king: PieceAt; box: Box; text: string; claim: Claim } {
  const board = new Chess(fen);
  const king = kingOf(board, color);
  const box = boxOf(board, king);
  return { king, box, text: boxText(board, box), claim: { claim: 'boxed', square: king.square, ...box } };
}

/** The mating move, what it does to the squares the king still had, and why nothing takes the checking piece. */
function mateText(c: Context, mate: Move, box: Box): string {
  const move = bare(mate.san);
  const out = box.free.length ? ` and covers ${listOf(box.free)}, so` : ', and';
  const safe = whyNotTaken(c, mate);
  return `${move} gives check${out} the king has no way out.${safe ? ` ${safe}` : ''}`;
}

/** "The king can't take your queen: your bishop on c4 guards it." "The pawn on f7 can't take it: your bishop on b3 pins it." */
function whyNotTaken(c: Context, mate: Move): string {
  const after = new Chess(mate.after);
  const enemy = otherColor(c.user);
  const king = kingOf(after, enemy);
  const piece = NAME[mate.promotion ?? mate.piece];
  const takers = after.attackers(mate.to, enemy);
  if (takers.includes(king.square)) {
    const guard = after.attackers(mate.to, c.user).map((s) => pieceOn(after, s)!)[0];
    if (guard) return `The king can't take your ${piece}: ${c.ref(guard)} guards it.`;
  }
  const pinned = takers.map((s) => pinOn(after, s)).find((pin) => pin?.pinner.color === c.user && pin.behind.type === 'k');
  return pinned ? `${capitalize(c.ref(pinned.pinned))} can't take it: ${c.ref(pinned.pinner)} pins it.` : '';
}

function checkmate(c: Context, t: Of<'checkmate'>): Beat[] | null {
  if (t.key === 2) return forcedMate(c, t);
  if (t.key !== 0) return null;
  const mate = t.moves[0];
  const { king, box, text, claim } = kingBox(c.fen, otherColor(c.user));
  return [
    {
      fen: c.fen,
      text,
      marks: [mark(king.square, 'focus'), ...marks([...box.blocked, ...box.covered], 'bad')],
      arrows: [],
      claims: [claim],
    },
    {
      fen: c.fen,
      text: mateText(c, mate, box),
      marks: [mark(king.square, 'focus')],
      arrows: [moveArrow(mate, 'best')],
      ...asking('Your move: give checkmate.', mate),
    },
  ];
}

/** Mate in two: the first move forces the reply, then the king is boxed in. */
function forcedMate(c: Context, t: Of<'checkmate'>): Beat[] {
  const [first, reply, mate] = t.moves;
  const { king, box, text, claim } = kingBox(reply.after, otherColor(c.user));
  const answers = new Chess(first.after).moves().length;
  const forces = answers === 1 ? `${first.san} leaves ${c.them} only one move: ${reply.san}.` : `${first.san} starts a forced mate. ${c.them}'s best try is ${reply.san}.`;
  return [
    {
      fen: c.fen,
      text: forces,
      marks: [],
      arrows: [moveArrow(first, 'best'), moveArrow(reply, 'threat')],
      ...asking(`Your move: play ${first.san}.`, first),
    },
    {
      fen: reply.after,
      move: uciOf(reply),
      text,
      marks: [mark(king.square, 'focus'), ...marks([...box.blocked, ...box.covered], 'bad')],
      arrows: [],
      claims: [claim],
    },
    { fen: reply.after, text: mateText(c, mate, box), marks: [mark(king.square, 'focus')], arrows: [moveArrow(mate, 'best')] },
  ];
}

function mateThreat(c: Context, t: Of<'mate-threat'>): Beat[] {
  const move = t.moves[0];
  const king = kingOf(new Chess(c.fen), otherColor(c.user));
  const threat = arrow(t.mate.from, t.mate.to, 'threat');
  const won = t.won && standing(move.after, [{ ...t.won, role: 'target' }])[0];
  // When the mate itself takes the piece, the piece is what stands between the king and mate.
  const tied = won && t.mate.to === won.square;
  return [
    {
      fen: c.fen,
      text: tied ? `${move.san} attacks ${c.ref(won)}, and taking it would be mate.` : `${move.san} threatens ${bare(t.mate.san)} mate.`,
      marks: [mark(king.square, 'focus')],
      arrows: [moveArrow(move, 'best'), threat],
      ...asking('Your move: threaten mate.', move),
    },
    {
      fen: move.after,
      move: uciOf(move),
      text: won ? mateCost(c, move, won, Boolean(tied)) : `${c.them} has to stop the mate, and that costs material.`,
      marks: won ? [mark(king.square, 'focus'), mark(won.square, 'bad')] : [mark(king.square, 'focus')],
      arrows: [threat],
    },
  ];
}

function mateCost(c: Context, move: Move, won: PieceAt, tied: boolean): string {
  if (tied) return `${c.them} can't stop the mate and keep ${c.ref(won)}.`;
  const hits = new Chess(move.after).attackers(won.square, c.user).includes(move.to);
  if (hits) return `It also attacks ${c.ref(won)}. ${c.them} can't stop the mate and save the ${NAME[won.type]}.`;
  return `Stopping the mate costs ${c.them} ${c.ref(won)}.`;
}
