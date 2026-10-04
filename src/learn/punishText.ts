import { Chess, type Color, type Move, type PieceSymbol, type Square } from 'chess.js';
import { NAME, attackedTargets } from '../board/captions';
import type { Turn } from '../content/types';
import { VALUE, otherColor, piecesOf, type PieceAt } from './board';
import type { Cost } from './loss';
import { looksFree } from './purpose';
import type { Tactic } from './tactics';
import type { Theme } from './themes';
import { capturedSquare } from './trade';
import { listOf } from './words';

// The sentences whyWrong tells a punishing line with, written for a beginner: at most two sentences of about twenty
// words, moves told in words ("Black's bishop moves to d5") and never as a run of notation, at most the user's move
// and one or two of the opponent's named, and what the move costs said last and plainly ("You lose a rook for a
// bishop.").

const COUNT = ['', 'a', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight'];
const NUMBER = ['no', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten'];
/** Words a sentence should stay within; past this the text leaves out what it can do without. */
export const MAX_WORDS = 20;
/** A sentence that names the pattern may run a little longer before the pattern is given up. */
const PATTERN_WORDS = 23;
/** Pawns by which the evaluation after a move may fall below its material before an attack must explain it. */
const UNEXPLAINED = 3;

/** What every sentence about one wrong move needs. */
export interface Say {
  turn: Turn;
  user: Color;
  /** The opponent, "White" or "Black". */
  them: string;
  /** The wrong move, as played. */
  move: Move;
  /** Moves a text must never name: the position's best move and the game's move. */
  answers: string[];
  /** Where those moves go: a square the text must not send an opponent's move to, since it would point at the answer. */
  answerSquares: Square[];
  /** The user's evaluation after the move by the grades, in pawns. */
  after: number;
}

/** A line that wins something from the wrong move, and what the move costs in it. */
export interface Caught {
  theme: Theme;
  t: Tactic;
  cost: Cost;
}

// ---- Words for pieces and moves.

/** "your knight on c5", or "your queen" when it is the only one of its kind there; the king goes without a square. */
function yours(say: Say, piece: { square: Square; type: PieceSymbol }, fen: string): string {
  if (piece.type === 'k') return 'your king';
  return `your ${NAME[piece.type]}${unique(fen, say.user, piece.type) ? '' : ` on ${piece.square}`}`;
}

/** "Black's bishop on f4", or "Black's queen" when it is the only one of its kind there. */
function theirs(say: Say, piece: { square: Square; type: PieceSymbol }, fen: string): string {
  if (piece.type === 'k') return `${say.them}'s king`;
  const them = otherColor(say.user);
  return `${say.them}'s ${NAME[piece.type]}${unique(fen, them, piece.type) ? '' : ` on ${piece.square}`}`;
}

function unique(fen: string, color: Color, type: PieceSymbol): boolean {
  return piecesOf(new Chess(fen), color).filter((p) => p.type === type).length <= 1;
}

/**
 * "your queen and rook on h8": pieces that all belong to the user, with "your" said once; three or more go
 * without their squares, as "your bishop and both rooks".
 */
export function yourList(refs: string[]): string {
  if (refs.length < 2 || !refs.every((r) => r.startsWith('your '))) return listOf(refs);
  if (refs.length < 3) return `your ${listOf(refs.map((r) => r.slice(5)))}`;
  const counts = new Map<string, number>();
  for (const name of refs.map((r) => r.slice(5).replace(/ on [a-h][1-8]$/, ''))) counts.set(name, (counts.get(name) ?? 0) + 1);
  return `your ${listOf([...counts].map(([name, n]) => (n === 1 ? name : `${n === 2 ? 'both' : NUMBER[n]} ${name}s`)))}`;
}

/** The first of the candidate sentences that stays within the word limit, else the last, shortest one. */
export function fitting(...candidates: string[]): string {
  return candidates.find((s) => sentences(s).every((one) => wordCount(one) <= MAX_WORDS)) ?? candidates.at(-1)!;
}

const sentences = (text: string) => text.split(/(?<=[.?])\s+(?=[A-Z])/);

/** The user's piece a capture takes, where it is taken: "your rook on f8", "the new queen on b8". */
export function capturedRef(say: Say, capture: Move): string {
  const square = capturedSquare(capture);
  // The piece the user has just moved needs no square when the reply takes it.
  const reply = capture.before === say.move.after && square === say.move.to && capture.captured === say.move.piece && !say.move.promotion;
  if (reply) return `your ${NAME[capture.captured!]}`;
  return newPiece(say, capture) ?? yours(say, { square, type: capture.captured! }, capture.before);
}

/** "your rook on c8": a piece taken later in the line, always with its square. */
function laterRef(say: Say, capture: Move): string {
  const square = capturedSquare(capture);
  return newPiece(say, capture) ?? (capture.captured === 'k' ? 'your king' : `your ${NAME[capture.captured!]} on ${square}`);
}

/** "the new queen on b8": the piece the move has just promoted to, worth only the pawn it was. */
function newPiece({ move }: Say, capture: Move): string | null {
  const taken = move.promotion && capture.to === move.to && capture.captured === move.promotion;
  return taken ? `the new ${NAME[move.promotion!]} on ${move.to}` : null;
}

/** The user's pieces other than the king that the reply attacks, as "your queen" or "your rook on a8"; pawns left out. */
export function attacked(say: Say, reply: Move): string[] {
  const chess = new Chess(reply.after);
  return chess
    .board()
    .flat()
    .flatMap((p) => (p && p.color === say.user && p.type !== 'p' && p.type !== 'k' ? [p] : []))
    .filter((p) => chess.attackers(p.square, otherColor(say.user)).includes(reply.to))
    .map((p) => yours(say, p, reply.after));
}

/** An opponent's move in words: "Black's bishop moves to d5", "White's queen takes your knight on g4", "White castles". */
export function played(say: Say, move: Move, check = true): string {
  if (move.isKingsideCastle() || move.isQueensideCastle()) return `${say.them} castles`;
  const who = `${say.them}'s ${NAME[move.piece]}`;
  const does = move.captured ? `takes ${capturedRef(say, move)}` : movesTo(say, move);
  const promotes = move.promotion ? ` and becomes a ${NAME[move.promotion]}` : '';
  return `${who} ${does}${promotes}${check && givesCheck(move) ? ' with check' : ''}`;
}

const givesCheck = (move: Move) => move.san.includes('+');

/** "moves to d5", or "moves forward" when the square is where the answer goes, so it isn't pointed at. */
export function movesTo(say: Say, move: Move): string {
  if (!say.answerSquares.includes(move.to)) return `moves to ${move.to}`;
  return move.piece === 'p' ? 'moves forward' : 'moves up';
}

/** "Taking the knight on d4": the user's capture, as the subject of a sentence. */
export function taking(move: Move): string {
  return `Taking the ${NAME[move.captured!]} on ${capturedSquare(move)}`;
}

/** "two pawns", "a rook and a pawn", "your queen" for the user's own: pieces in words, biggest first. */
function material(types: PieceSymbol[], own: boolean): string {
  const counts = new Map<PieceSymbol, number>();
  for (const type of [...types].sort((a, b) => VALUE[b] - VALUE[a])) counts.set(type, (counts.get(type) ?? 0) + 1);
  return listOf(
    [...counts].map(([type, n]) => (n > 1 ? `${COUNT[n]} ${NAME[type]}s` : own && type === 'q' ? 'your queen' : `a ${NAME[type]}`)),
  );
}

const worth = (types: PieceSymbol[]) => types.reduce((sum, type) => sum + VALUE[type], 0);

export function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

export function wordCount(sentence: string): number {
  return sentence.split(/\s+/).filter(Boolean).length;
}

// ---- The texts.

/** "White's queen takes your queen on d5 for free." */
export function blunderText(say: Say, caught: Caught): string {
  if (caught.t.id === 'checkmate') return mateText(say, caught.t, '');
  return told(say, caught, ['']);
}

/** The position's common mistake, told the way the lesson opens it: what draws the eye to the move, then what it costs. */
export function baitText(say: Say, caught: Caught): string {
  const { theme, t } = caught;
  if (t.id === 'checkmate') return mateText(say, t, `${lure(say) ?? 'That looks fine'}, but it`);
  const plainCapture = t.id === 'free-piece' || t.id === 'material-win';
  if (plainCapture && theme.bait!.kind === 'unguards') return unguardText(say, caught);
  if (plainCapture && theme.bait!.kind === 'walks-into' && t.key === 0) {
    const [reply] = t.moves;
    const taker = theirs(say, { square: reply.from, type: reply.piece }, reply.before);
    const text = `That puts your ${NAME[say.move.promotion ?? say.move.piece]} where ${taker} can take it`;
    return withLoss(say, caught, text, onlyKey(caught, t.key), false, [reply.captured!]);
  }
  const opening = lure(say);
  return opening && t.at === 0 ? told(say, caught, [`${opening}, but`, '']) : told(say, caught, ['']);
}

/**
 * "That doesn't stop White's threat: White's bishop takes your rook on f8. You lose a rook and a knight for a bishop."
 * The leads go from the fullest to the shortest, for a long line to fall back on.
 */
export function afterLead(say: Say, caught: Caught, leads: string[]): string {
  if (caught.t.id === 'checkmate') return mateText(say, caught.t, `${leads.at(-1)}:`);
  return told(say, caught, leads.map((lead) => `${lead}:`));
}

/** "That allows checkmate: Black's queen takes your pawn on g2." */
export function mateInOne(say: Say, mate: Move, lead = 'That allows checkmate'): string {
  return `${lead}: ${played(say, mate, false)}.`;
}

/**
 * A mate in one, or a forced mate told by its first move: "That allows checkmate: White's queen moves to h7.",
 * "That lets White force checkmate: it starts with White's rook moving to d8, and mate follows two moves later."
 */
function mateText(say: Say, t: Tactic, lead: string): string {
  const mate = t.moves[t.key];
  if (t.key === 0) {
    if (!lead) return mateInOne(say, mate);
    return lead.endsWith(':') ? `${lead} ${played(say, mate, false)}, and that's checkmate.` : `${lead} allows checkmate: ${played(say, mate, false)}.`;
  }
  const later = t.key / 2 === 1 ? 'on the next move' : `${NUMBER[t.key / 2]} moves later`;
  const first = `${capitalize(played(say, t.moves[0]))}, and checkmate follows ${later}.`;
  if (!lead) return `That lets ${say.them} force checkmate. ${first}`;
  if (lead.endsWith(':')) return `${lead} ${say.them} can force checkmate. ${first}`;
  return `${lead} lets ${say.them} force checkmate. ${first}`;
}

/** "Your queen to g6 attacks Black's queen", "Taking the pawn on f7 looks free": what draws the eye to the move. */
function lure(say: Say): string | null {
  const { move } = say;
  if (move.isKingsideCastle() || move.isQueensideCastle()) return 'Castling looks natural';
  if (move.captured) return looksFree(move) ? `${taking(move)} looks free` : `You take the ${NAME[move.captured]} on ${capturedSquare(move)}`;
  const hits = newTargets(say);
  const piece = NAME[move.promotion ?? move.piece];
  if (hits.length) return `Your ${piece} on ${move.to} attacks ${hits.length > 1 ? `${NUMBER[hits.length]} of ${say.them}'s pieces` : hits[0]}`;
  if (givesCheck(move)) return `Your ${piece} check on ${move.to} looks strong`;
  return null;
}

/** The enemy pieces the moved piece now hits that are worth hitting: bigger than it, or loose. */
function newTargets(say: Say): string[] {
  const { move } = say;
  const chess = new Chess(move.after);
  const hits = attackedTargets(chess, move.to, move.promotion ?? move.piece, move.color).filter((p) => p.type !== 'k');
  return hits.map((p) => theirs(say, p, move.after));
}

/** "The knight you moved was guarding your knight on c4, so Black's bishop takes it for free." */
function unguardText(say: Say, caught: Caught): string {
  const { t } = caught;
  const piece = NAME[say.move.piece];
  const guard = 'kq'.includes(say.move.piece) ? `Your ${piece}` : `The ${piece} you moved`;
  const guarded = capturedRef(say, t.moves[t.key]);
  const lead = leadTo(say, t, t.key, 'reply');
  const take = `${theirName(say, t.moves[t.key])} takes it`;
  const text = lead ? `${guard} was guarding ${guarded}, and ${lead.text}${take}` : `${guard} was guarding ${guarded}, so ${take}`;
  return withLoss(say, caught, text, onlyKey(caught, t.key) && !lead?.later, lead?.later, [t.moves[t.key].captured!]);
}

/** "Black's bishop": the piece that makes a move, without its square. */
function theirName(say: Say, move: Move): string {
  return `${say.them}'s ${NAME[move.piece]}`;
}

/**
 * The punishing line as two sentences, after an opening that is either empty, a lure ending in "but", or a lead
 * ending in a colon: what the opponent does, then what the user loses. The first sentence that fits the word limit
 * wins, from the fullest telling to the barest and from the fullest opening to the shortest; a pattern may run a
 * little over before it is given up.
 */
function told(say: Say, caught: Caught, openings: string[]): string {
  const sentence = (e: Event, opening: string) => (opening ? `${opening} ${e.text}` : capitalize(e.text));
  // "for free" closes the sentence when nothing else is lost.
  const words = ([e, text]: [Event, string]) => wordCount(text) + (e.free ? 2 : 0);
  // From the fullest telling to the barest: the first opening while it fits, a long way told from the reply on the
  // board before it is cut short, and a little over the limit for all but a lure. The user's move is named only when
  // the reply on the board is the move that matters, so a lure takes no lead.
  const tries = (level: Level, opening: string): [Event, string][] =>
    (['reply', 'short'] as const).flatMap((long) => {
      const e = event(say, caught, level, long);
      if (opening.endsWith('but') && e.lead) return [];
      const told: [Event, string] = [e, sentence(e, opening)];
      return words(told) <= MAX_WORDS || (words(told) <= PATTERN_WORDS && !opening.endsWith('but')) ? [told] : [];
    });
  // A lure goes before anything of the line does; a lead on the user's own capture stays, as it says what "in return" answers.
  const levels = [0, 1] as const;
  const fits = openings[0].endsWith('but')
    ? levels.flatMap((level) => openings.flatMap((o) => tries(level, o)))
    : openings.flatMap((o) => levels.flatMap((level) => tries(level, o)));
  const brief = openings.flatMap((o) => (['reply', 'short'] as const).map((long): [Event, string] => {
    const e = event(say, caught, 2, long);
    return [e, sentence(e, o.endsWith('but') && e.lead ? '' : o)];
  }));
  const [used, text] = fits[0] ?? brief.find((told) => words(told) <= MAX_WORDS) ?? brief.at(-1)!;
  return withLoss(say, caught, text, used.free, used.later, used.named);
}

/** What the opponent does in a line: a clause, whether nothing comes back for the one piece it names, and whether it skips moves. */
interface Event {
  text: string;
  free: boolean;
  later: boolean;
  /** Moves come before the one the text tells. */
  lead: boolean;
  /** The user's pieces the text says are taken. */
  named: PieceSymbol[];
}

/** 0 tells everything, 1 leaves out the later captures and the pieces attacked after a capture, 2 the pattern as well. */
type Level = 0 | 1 | 2;

/**
 * The sentence part on the moves: how the line gets there, the move that matters, and what it does. A long way
 * there starts from the reply on the board, or only says "a few moves later".
 */
function event(say: Say, caught: Caught, level: Level, long: Long): Event {
  const { t, cost } = caught;
  if (t.id === 'mate-threat') return mateThreat(say, caught, long);
  const pattern = level === 2 && t.id !== 'trapped-piece' ? null : patternOf(say, caught);
  const at = pattern ? t.at : t.key;
  const lead = leadTo(say, t, at, long);
  if (lead?.summary) return summary(say, caught);
  const move = t.moves[at];
  const back = pattern || !move.captured || cost.trade.won.includes(move.captured) ? '' : ' in return';
  // The barest telling keeps a check only when the move does nothing else.
  const check = givesCheck(move) && !pattern?.checks && (level < 2 || !move.promotion) ? ' with check' : '';
  const parts = [
    `${move.captured ? `takes ${capturedRef(say, move)}${back}` : castles(move) ? '' : movesTo(say, move)}${check}`.trim(),
    move.promotion ? `becomes a ${NAME[move.promotion]}` : '',
    ...(pattern?.does ?? []),
    ...(level > 0 || pattern ? [] : forkedText(say, caught)),
  ].filter(Boolean);
  // A piece that moves again after the reply the text has told is "it".
  const again = lead?.told && t.moves[0].to === move.from;
  const body = castles(move)
    ? `${say.them} castles${parts.length ? ` and ${listOf(parts)}` : ''}`
    : `${again ? 'it' : theirName(say, move)} ${listOf(parts)}`;
  const then = level > 0 ? (at < t.key && !named(t, at) ? [t.moves[t.key]] : []) : laterTaken(caught, at);
  const thenText = then.map((m) => `, and later ${say.them} takes ${laterRef(say, m)}`).join('');
  const free = !pattern?.tail && !then.length && parts.length === 1 && onlyKey(caught, at) && !lead?.later;
  const key = t.moves[t.key].captured;
  const told = [
    ...(lead?.taken ?? []),
    ...(move.captured ? [move.captured] : []),
    ...(at < t.key && key && named(t, at) ? [key] : []),
    ...then.map((m) => m.captured!),
  ];
  const text = `${lead?.text ?? ''}${body}${pattern?.tail ?? ''}${thenText}`;
  return { text, free, later: Boolean(lead?.later), lead: Boolean(lead), named: told };
}

/** "White's bishop moves to f4 and attacks your queen": the reply on the board, for a line whose middle can't be told short. */
function summary(say: Say, { t }: Caught): Event {
  const [reply] = t.moves;
  const hits = attacked(say, reply);
  const text = `${played(say, reply)}${hits.length ? ` and attacks ${yourList(hits)}` : ''}`;
  return { text, free: false, later: true, lead: false, named: reply.captured ? [reply.captured] : [] };
}

const castles = (move: Move) => move.isKingsideCastle() || move.isQueensideCastle();

/** The only thing the line costs is the piece the move at `at` takes, and nothing comes back. */
function onlyKey({ t, cost }: Caught, at: number): boolean {
  const { won, lost, promoted } = cost.trade;
  return at === t.key && !lost.length && !promoted.length && won.length === 1 && won[0] === t.moves[t.key].captured && !cost.checks;
}

/** "White's queen moves to g4 and threatens checkmate on g7. Stopping it costs you a rook." as an event. */
function mateThreat(say: Say, { t }: Caught, long: Long): Event {
  if (t.id !== 'mate-threat') throw new Error('not a mate threat');
  const lead = leadTo(say, t, t.at, long);
  const move = t.moves[t.at];
  const does = [move.captured ? `takes ${capturedRef(say, move)}` : movesTo(say, move), `threatens checkmate on ${t.mate.to}`];
  const text = `${lead?.text ?? ''}${theirName(say, move)} ${listOf(does)}`;
  return { text, free: false, later: Boolean(lead?.later), lead: Boolean(lead), named: [] };
}

/** How a pattern is told: what its move does besides moving or taking, and a clause after it. */
interface Told {
  does: string[];
  tail?: string;
  checks?: boolean;
}

/** The pattern of the line in words, or null for a plain capture. */
function patternOf(say: Say, { t }: Caught): Told | null {
  const fen = t.moves[t.at].after;
  const your = (p: PieceAt) => yours(say, p, fen);
  switch (t.id) {
    case 'fork': {
      const king = t.targets.some((p) => p.type === 'k');
      const hits = t.targets.filter((p) => p.type !== 'k').map(your);
      return { does: [...(king ? ['checks your king'] : []), `attacks ${yourList(hits)} at once`], checks: king };
    }
    case 'pin':
      if (t.how === 'created') return { does: [`pins ${your(t.pin.pinned)} to ${your(t.pin.behind)}`] };
      if (t.how === 'attacked') return { does: [`attacks ${your(t.pin.pinned)}, which is pinned to ${your(t.pin.behind)}`] };
      if (t.how !== 'defender' || t.at !== t.key) return null;
      return { does: [], tail: `, and your pinned ${NAME[t.pin.pinned.type]} can't take back` };
    case 'skewer':
      if (t.front.type === 'k') return { does: [`checks your king with ${your(t.back)} behind it`], checks: true };
      return { does: [`attacks ${your(t.front)} with ${your(t.back)} behind it`] };
    case 'discovered-attack': {
      if (t.at !== 0) return null;
      const slider = theirs(say, t.slider, fen);
      const tail = `, and now ${slider} ${t.target.type === 'k' ? 'checks your king' : `attacks ${your(t.target)}`}`;
      return { does: [], tail, checks: t.target.type === 'k' };
    }
    case 'trapped-piece':
      return { does: [], tail: `, and ${your(t.trapped)} can't escape` };
    case 'remove-defender': {
      const guarded = your(t.guarded);
      if (t.how === 'chase') return { does: [`chases away ${your(t.defender)}, which guards ${guarded}`] };
      if (t.how === 'deflect') return { does: [`lures ${your(t.defender)} away from ${guarded}`] };
      return { does: [], tail: `, and ${guarded} is left unguarded` };
    }
    default:
      return null;
  }
}

/** How a long way to the move that matters is told: from the reply on the board, or as "a few moves later". */
type Long = 'reply' | 'short';

interface Lead {
  text: string;
  /** Moves of the line go untold, so the loss is given as the end result. */
  later: boolean;
  /** The lead tells the reply on the board by its piece. */
  told?: boolean;
  /** The user's pieces the lead says are taken. */
  taken?: PieceSymbol[];
  /** The middle hides captures of the user's own that the move that matters makes up for: tell the reply alone. */
  summary?: boolean;
}

/** The moves before the one that matters, in a few words; null when the reply on the board is that move. */
function leadTo(say: Say, t: Tactic, at: number, long: Long): Lead | null {
  if (at <= 0) return null;
  const before = t.moves.slice(0, at);
  const [reply, answer] = before;
  const shown = (m: Move) => say.answers.includes(m.san);
  if (before.length === 2 && answer.captured && answer.to === reply.to && !shown(answer)) {
    const alike = reply.captured === answer.captured || VALUE[reply.captured ?? 'k'] === VALUE[answer.captured];
    if (reply.captured === 'q' && answer.captured === 'q') return { text: 'after the queens are traded, ', later: false };
    return { text: alike ? `after a trade on ${reply.to}, ` : `after the captures on ${reply.to}, `, later: false };
  }
  // The reply takes the piece that has just captured: "Black takes back on a4".
  const takesBack = say.move.captured && reply.captured && reply.to === say.move.to;
  const first = takesBack ? `${say.them} takes back on ${reply.to}` : played(say, reply);
  const taken = reply.captured ? [reply.captured] : [];
  if (before.length === 2 && !answer.captured) {
    if (givesCheck(reply) && (!reply.captured || long === 'short')) return { text: 'after a check, ', later: false };
    if (long === 'short') return { text: 'a move later, ', later: false };
    // The user's reply puts the piece where it is then taken: say there was one.
    const moved = answer.to === capturedSquare(t.moves[at]) || answer.to === t.moves[at].to;
    return { text: `${first}, and ${moved ? 'after your reply,' : 'then'} `, later: false, told: !takesBack, taken };
  }
  // The user takes something on the way that the capture at the end only wins back: the middle can't be skipped.
  const hidden = before.some((m) => m.color !== t.side && m.captured && !(m === answer && m.to === reply.to));
  if (hidden && t.moves[at].captured && long === 'short') return { text: '', later: true, summary: true };
  if (long === 'reply') return { text: `${first}, and a few moves later `, later: true, told: !takesBack, taken };
  return { text: 'a few moves later, ', later: true };
}

/** Captures that add to the cost after the move the text tells: the key capture when the pattern doesn't name its piece, and later ones. */
function laterTaken({ t, cost }: Caught, at: number): Move[] {
  return at < t.key && !named(t, at) ? [t.moves[t.key], ...cost.then] : cost.then;
}

/** Whether the pattern at `at` already names the piece the key capture takes. */
function named(t: Tactic, at: number): boolean {
  const square = capturedSquare(t.moves[t.key]);
  const squares = (() => {
    switch (t.id) {
      case 'fork':
        return t.targets.map((p) => p.square);
      case 'skewer':
        return [t.front.square, t.back.square];
      case 'pin':
        return [t.pin.pinned.square, t.pin.behind.square];
      case 'trapped-piece':
        return [t.trapped.square];
      case 'remove-defender':
        return [t.guarded.square, t.defender.square];
      case 'discovered-attack':
        return [t.target.square];
      default:
        return [];
    }
  })();
  // The piece may step aside before it is taken: follow it from where the pattern found it.
  let at2 = square;
  for (let i = t.key - 1; i > at; i--) if (t.moves[i].to === at2 && t.moves[i].color !== t.side) at2 = t.moves[i].from;
  return squares.includes(at2) || t.won?.square === at2;
}

/** "attacks your queen and your rook at once": the user's pieces the key capture's piece hits once the exchange is over. */
function forkedText(say: Say, { t, cost }: Caught): string[] {
  if (cost.forked.length < 2) return [];
  const fen = t.moves[t.key].after;
  const hits = cost.forked.filter((p) => p.type !== 'k').map((p) => yours(say, p, fen));
  const king = cost.forked.some((p) => p.type === 'k') ? ['checks your king'] : [];
  return [...king, `then attacks ${yourList(hits)}`];
}

/** The event sentence, then the loss: "You lose your queen and only get a bishop back." */
function withLoss(say: Say, caught: Caught, first: string, free: boolean, later = false, named: PieceSymbol[] = []): string {
  const loss = lossText(say, caught, later || !sameTypes(named, caught.cost.trade.won));
  if (free && !loss.extra) return `${first} for free.`;
  return loss.text ? `${first}. ${loss.text}` : `${first}.`;
}

/** "you lose a rook, and White keeps checking your king": clauses joined with a comma before the last "and". */
function clauses(items: string[]): string {
  return items.length < 2 ? (items[0] ?? '') : `${items.slice(0, -1).join(', ')}, and ${items.at(-1)}`;
}

function sameTypes(a: PieceSymbol[], b: PieceSymbol[]): boolean {
  return [...a].sort().join() === [...b].sort().join();
}

/** What the line costs, as a sentence told as the end result when the text doesn't show every piece of it, and whether it says more than the pieces lost. */
function lossText(say: Say, { t, cost }: Caught, end: boolean): { text: string; extra: boolean } {
  const { won, lost: back, promoted } = cost.trade;
  const extras = [
    ...promoted.map((type) => `${say.them} gets a new ${NAME[type]}`),
    ...(attackGoesOn(say, t, cost) ? [`${say.them} keeps ${cost.checks ? 'checking' : 'attacking'} your king`] : []),
  ];
  const extra = extras.length > 0;
  if (t.id === 'mate-threat') {
    const costs = `${material(won, true)}${back.length ? ` for ${material(back, false)}` : ''}`;
    return { text: `Stopping it costs you ${costs}.`, extra: true };
  }
  if (!won.length) return { text: extras.length ? `${capitalize(clauses(extras))}.` : '', extra };
  const lose = material(won, true);
  const only = won.length === 1 && back.length === 1 && worth(won) > worth(back);
  const gets = !back.length ? `you lose ${lose}` : only ? `you lose ${lose} and only get ${material(back, false)} back` : `you lose ${lose} for ${material(back, false)}`;
  return { text: `${capitalize(clauses([end ? `in the end, ${gets}` : gets, ...extras]))}.`, extra };
}

/** The checks go on, or they come with an evaluation far below what the material left would give. */
function attackGoesOn(say: Say, t: Tactic, cost: Cost): boolean {
  const checks = t.moves.slice(t.key).some((m) => m.color === t.side && givesCheck(m));
  return cost.checks || (checks && say.after < say.turn.material - cost.trade.net - UNEXPLAINED);
}
