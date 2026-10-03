import { Chess, type Color, type Move, type PieceSymbol, type Square } from 'chess.js';
import { NAME, attackedTargets } from '../board/captions';
import type { ArrowTone, Tone } from '../board/types';
import type { Game, Turn } from '../content/types';
import {
  VALUE,
  directionTo,
  exchangeGain,
  isBetween,
  isLoose,
  kingOf,
  otherColor,
  passTurn,
  pieceOn,
  piecesAlong,
  pinOn,
  playLine,
  uciOf,
  type PieceAt,
} from './board';
import { ideaOf, replyText } from './ideas';
import type { Tactic, TacticId } from './tactics';
import { themeFor, type Theme, type ThemePiece } from './themes';
import { tradeOf } from './trade';
import { capitalize, colorName, listOf, refer, sequence, tradeText } from './words';

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
}

/** Plies of the best line shown after a defence or a trap; a win plays until the material is in. */
const DEFENCE_PLIES = 4;
const MAX_PLIES = 8;
/** Longest run of moves spelled out before a pin pays off. */
const SHORT_LEAD = 4;
const COUNT = ['no', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight'];

/** The worked example of a key position, step by step, ending on the line that follows. */
export function walkthrough(game: Game, turnIndex: number): Beat[] {
  const turn = game.turns[turnIndex];
  const user = game.side;
  const c: Context = {
    fen: turn.fen,
    turn,
    theme: themeFor(game, turnIndex),
    user,
    them: colorName(otherColor(user)),
    ref: (piece) => refer(piece, user),
  };
  const beats = steps(c);
  return [...beats, lineBeat(c, beats.at(-1))];
}

function steps(c: Context): Beat[] {
  const t = c.theme.tactic;
  if (!t) return lookAt(c);
  switch (c.theme.id) {
    case 'hanging-own':
      return hangingOwn(c, t) ?? lookAt(c);
    case 'threat-other':
      return threatOther(c, t);
    case 'bait':
      return bait(c, t) ?? lookAt(c);
  }
  // Every template reads the pieces where they stand now, so the tactic must start with this move.
  return (t.at === 0 ? winSteps(c, t) : null) ?? lookAt(c);
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
const count = (n: number) => COUNT[n] ?? String(n);
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

function isWin(theme: Theme): boolean {
  return !['hanging-own', 'threat-other', 'bait', 'quiet'].includes(theme.id);
}

/** The line goes on from where the steps left the board, or from the start when they left the line. */
function lineBeat(c: Context, last: Beat | undefined): Beat {
  const best = bestMove(c);
  const idea = ideaOf(c.theme, c.user, { fen: c.fen, best: c.turn.lines.best?.[0] });
  // The threat alone leaves out the answer the line plays.
  const text = c.theme.id === 'threat-other' && best ? `${idea} ${best.san} stops it.` : idea;
  const line = lineMoves(c);
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

/** A win plays until the main piece is taken; anything else plays a few moves. */
function lineMoves({ theme, turn }: Context): string[] {
  const best = turn.lines.best ?? [];
  const t = theme.tactic;
  return best.slice(0, t && isWin(theme) ? winPlies(t) : DEFENCE_PLIES);
}

/** Up to the capture that wins, then the captures that follow on that square, so the exchange is seen through. */
function winPlies(t: Tactic): number {
  let end = Math.max(0, t.key);
  const square = t.moves[end].to;
  while (t.moves[end + 1]?.to === square && t.moves[end + 1].captured) end++;
  return Math.min(end + 1, MAX_PLIES);
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
  const attackers = board.attackers(target.square, c.user);
  const guards = board.attackers(target.square, target.color);
  const claims: Claim[] = [
    { claim: 'attackers', square: target.square, squares: attackers },
    { claim: 'guards', square: target.square, squares: guards },
  ];
  const seen = [mark(target.square, 'focus'), ...marks(attackers, 'good'), ...marks(guards, 'bad')];
  return [
    { fen: c.fen, text: freeReason(c, t, board, attackers, guards), marks: seen, arrows: [], claims },
    {
      fen: c.fen,
      text: freeWin(t),
      marks: [mark(target.square, 'focus')],
      arrows: [moveArrow(take, 'best')],
      ...asking(`Your move: take the ${NAME[target.type]}.`, take),
    },
  ];
}

/** Who attacks: "your knight on c3", or "two of your pieces". */
function attackersText(c: Context, board: Chess, attackers: Square[]): string {
  return attackers.length === 1 ? c.ref(pieceOn(board, attackers[0])!) : `${count(attackers.length)} of your pieces`;
}

function freeReason(c: Context, t: Of<'free-piece'>, board: Chess, attackers: Square[], guards: Square[]): string {
  const piece = c.ref(t.won!);
  const who = capitalize(attackersText(c, board, attackers));
  const hit = attackers.length === 1 ? 'attacks' : 'attack';
  if (!guards.length) return `${who} ${hit} ${piece}, and nothing guards it.`;
  if (t.reason === 'cheaper') return `${capitalize(piece)} is guarded, but it is worth more than your ${NAME[t.moves[0].piece]}.`;
  if (attackers.length > guards.length) return `${who} ${hit} ${piece}, and only ${count(guards.length)} ${guardVerb(guards.length)} it.`;
  return `${capitalize(piece)} is not guarded well enough.`;
}

/** What the capture wins over the moves the lesson plays. */
function freeWin(t: Of<'free-piece'>): string {
  const san = t.moves[0].san;
  const trade = tradeOf(t.moves.slice(0, winPlies(t)), t.side);
  const alone = trade.won.length === 1 && !trade.lost.length;
  if (alone) return t.reason === 'undefended' ? `So ${san} wins it for free.` : `So ${san} wins it.`;
  return `So ${san} wins ${tradeText(trade)}.`;
}

function hangingOwn(c: Context, t: Tactic): Beat[] | null {
  const take = t.moves[0];
  const mine = t.won;
  if (!mine || t.at !== 0 || !standing(c.fen, [{ ...mine, role: 'target' }]).length) return null;
  const board = new Chess(c.fen);
  const attackers = board.attackers(mine.square, otherColor(c.user));
  const guards = board.attackers(mine.square, c.user);
  const danger: Beat = {
    fen: c.fen,
    text: dangerText(c, t, board, take, attackers, guards),
    marks: [mark(mine.square, 'bad'), ...marks(guards, 'good')],
    arrows: attackers.map((from) => arrow(from, mine.square, 'threat')),
    claims: [
      { claim: 'attackers', square: mine.square, squares: attackers },
      { claim: 'guards', square: mine.square, squares: guards },
    ],
  };
  const best = bestMove(c);
  if (!best) return [danger];
  const save = saveText(mine, take, best);
  return [
    danger,
    { fen: c.fen, text: save.text, marks: [mark(mine.square, 'focus')], arrows: [moveArrow(best, 'best')], ...asking(save.ask, best) },
  ];
}

function dangerText(c: Context, t: Tactic, board: Chess, take: Move, attackers: Square[], guards: Square[]): string {
  const piece = c.ref(t.won!);
  const by = c.ref(pieceOn(board, take.from)!);
  if (!guards.length) return `${capitalize(piece)} is attacked by ${by}, and nothing guards it.`;
  if (t.id === 'free-piece' && t.reason === 'cheaper') return `${capitalize(piece)} is attacked by ${by}, which is worth less.`;
  if (attackers.length > guards.length) {
    return `${capitalize(count(attackers.length))} enemy pieces attack ${piece}, and only ${count(guards.length)} ${guardVerb(guards.length)} it.`;
  }
  return `${capitalize(piece)} is attacked by ${by}, and it is not guarded well enough.`;
}

/** "moves it to safety", "trades it for the knight", "moves it away, taking a pawn". */
function movesAway(best: Move, mine: PieceAt): string {
  const safe = !isLoose(best.after, best.to);
  if (!best.captured) return `moves it ${safe ? 'to safety' : 'away'}`;
  if (!safe && VALUE[best.captured] >= VALUE[mine.type]) return `trades it for the ${NAME[best.captured]}`;
  return `moves it ${safe ? 'to safety' : 'away'}, taking ${takenText(best.captured)}`;
}

/** What the best move does for the piece in danger, when it plainly saves it. */
function saveText(mine: PieceAt, take: Move, best: Move): { text: string; ask: string } {
  const name = NAME[mine.type];
  if (best.to === take.from && best.captured) return { text: `${best.san} takes the attacker.`, ask: 'Your move: take the attacker.' };
  if (best.from === mine.square) {
    const away = movesAway(best, mine);
    return { text: `${best.san} ${away}.`, ask: away.startsWith('trades') ? 'Your move: trade it off.' : `Your move: save your ${name}.` };
  }
  if (isBetween(take.from, best.to, mine.square)) return { text: `${best.san} blocks the attack.`, ask: 'Your move: block it.' };
  if (best.san.includes('+')) return { text: `${best.san} comes first: it gives check.`, ask: 'Your move: give check.' };
  const guards = (fen: string) => new Chess(fen).attackers(mine.square, mine.color).length;
  if (guards(best.after) > guards(best.before) && !isLoose(best.after, mine.square)) {
    return { text: `${best.san} guards it.`, ask: `Your move: guard your ${name}.` };
  }
  return { text: `The best answer is ${best.san}.`, ask: 'Your move: play it.' };
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
  return [
    warn,
    {
      fen: c.fen,
      text: `Your move must stop it, and ${best.san} does.`,
      marks: hit,
      arrows: [moveArrow(best, 'best')],
      ...asking('Your move: stop the threat.', best),
    },
  ];
}

function bait(c: Context, t: Tactic): Beat[] | null {
  const lure = c.theme.bait?.move;
  if (!lure) return null;
  const looks = lure.captured ? `${lure.san} takes ${takenText(lure.captured)}, and it looks free.` : `${lure.san} looks like a natural move.`;
  const reply = t.moves[0];
  const hit = standing(lure.after, c.theme.pieces.filter((p) => p.color === c.user && p.role !== 'mover'));
  const beats: Beat[] = [
    { fen: c.fen, text: looks, marks: [], arrows: [moveArrow(lure, 'mistake')] },
    {
      fen: lure.after,
      move: uciOf(lure),
      text: t.id === 'checkmate' && t.key === 0 ? `But ${bare(reply.san)} is checkmate.` : `But ${replyText(t, c.user)}.`,
      marks: marks(hit.map((p) => p.square), 'bad'),
      arrows: [moveArrow(reply, 'threat')],
    },
  ];
  const best = bestMove(c);
  if (!best || best.san === lure.san) return beats;
  return [
    ...beats,
    { fen: c.fen, text: `Instead, play ${best.san}.`, marks: [], arrows: [moveArrow(best, 'best')], ...asking('Your move: play it.', best) },
  ];
}

function takenText(type: PieceSymbol): string {
  return type === 'p' ? 'a pawn' : `the ${NAME[type]}`;
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
  const stuck =
    t.how !== 'defender' ? '' : behind.type === 'k' ? ` It can't take back on ${move.to}.` : ` It can't take back on ${move.to} without losing ${back}.`;
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
      text: `Now ${c.ref(pinned)} is pinned to ${back}.${stuck}`,
      marks: [mark(pinned.square, 'bad'), mark(behind.square, 'focus')],
      arrows: [arrow(pinner.square, behind.square, 'threat')],
      claims: [{ claim: 'pin', square: pinned.square, pinner: pinner.square, behind: behind.square }],
    },
  ];
}

function pinUse(c: Context, t: Of<'pin'>, back: string): string {
  const san = t.moves[0].san;
  switch (t.how) {
    case 'attacked': {
      const taken = t.moves[0].captured;
      return `So ${san} ${taken ? `takes ${takenText(taken)} and ` : ''}attacks it. It can't run.`;
    }
    case 'defender': {
      const wins = t.key === 0 ? tradeText(tradeOf(t.moves.slice(0, winPlies(t)), t.side)) : 'material';
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
      text: king ? `${move.san} gives check along that line.` : `${move.san} attacks the ${NAME[front.type]} along that line.`,
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

/** The moved piece's own threat: a check, else the biggest piece it now attacks. */
function moverThreat(c: Context, move: Move, target: PieceAt): PieceAt | null {
  const hits = attackedTargets(new Chess(move.after), move.to, move.promotion ?? move.piece, c.user).filter((p) => p.square !== target.square);
  const hit = hits.find((p) => p.type === 'k') ?? hits.sort((a, b) => VALUE[b.type] - VALUE[a.type])[0];
  return hit ? { ...hit, color: otherColor(c.user) } : null;
}

function twoAttacks(c: Context, t: Of<'discovered-attack'>, move: Move, hit: PieceAt | null): string {
  const slider = `Your ${NAME[t.slider.type]}`;
  const king = t.target.type === 'k';
  const opened = king ? `${slider} gives check` : `${slider} now attacks ${c.ref(t.target)}`;
  const mover = `your ${NAME[move.promotion ?? move.piece]}`;
  if (hit) return `${opened}, and ${mover} ${hit.type === 'k' ? 'gives check' : `attacks ${c.ref(hit)}`}. Two attacks at once.`;
  if (!move.captured) return `${opened}.`;
  if (king) return `${opened}, so ${c.them} must answer the check first.`;
  return `${opened}, so ${c.them} can't take back on ${move.to} and save it too.`;
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
      text: trapText(c, t, squares.length === 0 ? 'none' : covered.length === squares.length ? 'all' : 'some'),
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

/** What the move does to the piece: attacks it, or opens a line onto it; then that none of its squares is safe. */
/** What the move does to the piece, and then that none of its squares is safe; `covered` tells how many were before. */
function trapText(c: Context, t: Of<'trapped-piece'>, covered: 'none' | 'some' | 'all'): string {
  const move = t.moves[0];
  const square = t.trapped.square;
  const hitBy = (fen: string) => new Chess(fen).attackers(square, c.user);
  const opener = hitBy(move.after).find((from) => !hitBy(move.before).includes(from) && isBetween(from, move.from, square));
  const end = { none: 'it has nowhere to go', all: 'it has nowhere safe to go', some: 'every square it could go to is covered' }[covered];
  if (hitBy(move.after).includes(move.to)) return `${move.san} attacks it, and ${end}.`;
  if (opener) return `${move.san} opens the line from ${c.ref(pieceOn(new Chess(move.after), opener)!)} to it, and ${end}.`;
  return `After ${move.san}, the ${NAME[t.trapped.type]} can be won, and ${end}.`;
}

function removeDefender(c: Context, t: Of<'remove-defender'>): Beat[] {
  const move = t.moves[0];
  const { defender, guarded } = t;
  const board = new Chess(c.fen);
  const guards = board.attackers(guarded.square, guarded.color);
  const attackers = board.attackers(guarded.square, c.user);
  const only =
    guards.length === 1
      ? `${capitalize(attackersText(c, board, attackers))} ${attackers.length === 1 ? 'attacks' : 'attack'} ${c.ref(guarded)}, and only ${c.ref(defender)} guards it.`
      : `${capitalize(c.ref(defender))} is one of ${count(guards.length)} pieces guarding ${c.ref(guarded)}.`;
  const beats: Beat[] = [
    {
      fen: c.fen,
      text: only,
      marks: [mark(guarded.square, 'focus'), ...marks(attackers, 'good')],
      arrows: [arrow(defender.square, guarded.square, 'mistake')],
      claims: [
        { claim: 'guards', square: guarded.square, squares: guards },
        { claim: 'attackers', square: guarded.square, squares: attackers },
      ],
    },
    {
      fen: c.fen,
      text: `${move.san} ${removeVerb(t)}.`,
      marks: [mark(defender.square, 'focus')],
      arrows: [moveArrow(move, 'best'), arrow(defender.square, guarded.square, 'mistake')],
      ...asking(`Your move: ${REMOVE_ASKS[t.how]} the ${NAME[defender.type]}${t.how === 'capture' ? '' : ' away'}.`, move),
    },
  ];
  const hangs = hangsAfterReply(t);
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
function hangsAfterReply(t: Of<'remove-defender'>): Beat | null {
  const reply = t.moves[1];
  const take = t.moves[t.key];
  if (!reply || t.key !== 2) return null;
  const square = t.guarded.square;
  const free = new Chess(reply.after).attackers(square, t.guarded.color).length === 0;
  if (!free && !isLoose(reply.after, square)) return null;
  return {
    fen: reply.after,
    move: uciOf(reply),
    text: free ? `Now nothing guards it, and ${take.san} wins it.` : `Now it hangs, and ${take.san} wins it.`,
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

/** The mating move, and what it does to the squares the king still had. */
function mateText(mate: Move, box: Box): string {
  const move = bare(mate.san);
  if (!box.free.length) return `${move} gives check, and the king has no way out.`;
  return `${move} gives check and also covers ${listOf(box.free)}, so the king has no way out.`;
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
      text: mateText(mate, box),
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
      text: `${text} ${mateText(mate, box)}`,
      marks: [mark(king.square, 'focus'), ...marks([...box.blocked, ...box.covered], 'bad')],
      arrows: [moveArrow(mate, 'best')],
      claims: [claim],
    },
  ];
}

function mateThreat(c: Context, t: Of<'mate-threat'>): Beat[] {
  const move = t.moves[0];
  const king = kingOf(new Chess(c.fen), otherColor(c.user));
  const threat = arrow(t.mate.from, t.mate.to, 'threat');
  const won = t.won && standing(move.after, [{ ...t.won, role: 'target' }])[0];
  return [
    {
      fen: c.fen,
      text: `${move.san} threatens ${bare(t.mate.san)} mate.`,
      marks: [mark(king.square, 'focus')],
      arrows: [moveArrow(move, 'best'), threat],
      ...asking('Your move: threaten mate.', move),
    },
    {
      fen: move.after,
      move: uciOf(move),
      text: won ? mateCost(c, move, won) : `${c.them} has to stop the mate, and that costs material.`,
      marks: won ? [mark(king.square, 'focus'), mark(won.square, 'bad')] : [mark(king.square, 'focus')],
      arrows: [threat],
    },
  ];
}

function mateCost(c: Context, move: Move, won: PieceAt): string {
  const hits = new Chess(move.after).attackers(won.square, c.user).includes(move.to);
  if (hits) return `It also attacks ${c.ref(won)}. ${c.them} can't stop the mate and save the ${NAME[won.type]}.`;
  return `Stopping the mate costs ${c.them} the ${NAME[won.type]}.`;
}
