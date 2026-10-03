import { Chess, type Color, type Move, type PieceSymbol } from 'chess.js';
import { NAME } from '../board/captions';
import type { Turn } from '../content/types';
import { VALUE, otherColor, type PieceAt } from './board';
import type { Cost } from './loss';
import type { Tactic } from './tactics';
import type { Theme } from './themes';
import { capturedSquare } from './trade';
import { listOf, refer } from './words';

// The sentences whyWrong tells a punishing line with: what the opponent plays and what it costs the user.

const COUNT = ['', 'a', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight'];
/** Longest run of moves before a capture worth spelling out. */
const SHORT_LINE = 4;
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
  /** The user's evaluation after the move by the grades, in pawns. */
  after: number;
}

/** A line that wins something from the wrong move, and what the move costs in it. */
export interface Caught {
  theme: Theme;
  t: Tactic;
  cost: Cost;
}

/** How a clause is told: from the start of the sentence, and whether the text has already said what the move grabbed. */
export interface Voice {
  opening?: boolean;
  grabbed?: boolean;
}

/** "Bxf7+ grabs a pawn", "Qd7 looks natural": how the lesson opens a trap. */
export function tempting(move: Move): string {
  if (!move.captured) return `${move.san} looks natural`;
  return `${move.san} grabs ${move.captured === 'p' ? 'a pawn' : `the ${NAME[move.captured]}`}`;
}

/** "After Qd5, Qxd5 wins your queen on d5." */
export function blunderText(say: Say, caught: Caught): string {
  const { t } = caught;
  if (t.id === 'checkmate') {
    if (t.key === 0) return `After ${say.move.san}, ${mateMove(t)} is checkmate.`;
    return `After ${say.move.san}, ${say.them} has a forced mate that starts with ${t.moves[0].san}.`;
  }
  return `${clause(say, caught, { opening: true })}.`;
}

/** The position's common mistake, told the way the lesson opens it. */
export function baitText(say: Say, caught: Caught): string {
  const { theme, t } = caught;
  const move = say.move.san;
  if (t.id === 'checkmate') {
    return t.key === 0
      ? `${move} looks fine, but it allows ${mateMove(t)}, checkmate.`
      : `${move} looks fine, but it allows a forced mate that starts with ${t.moves[0].san}.`;
  }
  const plainCapture = t.id === 'free-piece' || t.id === 'material-win';
  if (plainCapture && theme.bait!.kind === 'unguards') {
    return `${move} moves the ${NAME[say.move.piece]} that was guarding ${keyPiece(t, say.user)}, ${guardLost(say, caught)}.`;
  }
  if (plainCapture && theme.bait!.kind === 'walks-into' && t.key === 0) {
    const attacker = refer({ square: t.moves[0].from, type: t.moves[0].piece, color: t.side }, say.user);
    const piece = `your ${NAME[say.move.promotion ?? say.move.piece]}`;
    return `${move} puts ${piece} where ${attacker} can take it, and ${mover(say, t.moves[0])} ${rest(say, caught, {}, keyVerb(say, caught, {}, 'it'))}.`;
  }
  return `${tempting(say.move)}, but ${clause(say, caught, { grabbed: Boolean(say.move.captured) })}.`;
}

/** "so Nxe4 wins it", "and after Bxc1 Rfxc1, Bxc4 wins it". */
function guardLost(say: Say, caught: Caught): string {
  const { t } = caught;
  const lead = leadTo(say, t, 0, t.key);
  const tail = rest(say, caught, {}, keyVerb(say, caught, {}, 'it'));
  const key = mover(say, t.moves[t.key]);
  return lead ? `and ${leadText(say, lead, key, {})} ${tail}` : `so ${key} ${tail}`;
}

function mateMove(t: Tactic): string {
  return t.moves[t.key].san.replace('#', '');
}

/** How the moves before a capture are told: spelled out, named as a trade, or as the opponent's moves alone. */
type Lead = { after: string } | { once: string } | { theirs: Move[] } | null;

/** The moves from `from` up to `to` in the tactic's line, told as a lead to the move at `to`. */
function leadTo(say: Say, t: Tactic, from: number, to: number): Lead {
  if (to <= from) return null;
  const before = t.moves.slice(from, to);
  const sans = before.map((m) => m.san);
  if (sans.includes(say.move.san)) {
    const trade = tradeName(before);
    if (trade) return { once: trade };
  } else if (before.length <= SHORT_LINE && !sans.some((san) => say.answers.includes(san))) {
    return { after: sans.join(' ') };
  }
  return { theirs: before.filter((m) => m.color === t.side) };
}

/** "the queens come off", "the knights are traded on e4": two moves that take and take back alike. */
function tradeName(moves: Move[]): string | null {
  const [take, back] = moves;
  if (moves.length !== 2 || !take.captured || back.to !== take.to || VALUE[back.captured!] !== VALUE[take.captured]) return null;
  return take.captured === 'q' ? 'the queens come off' : `the ${NAME[take.captured]}s are traded on ${take.to}`;
}

/** Joins a lead to the move it leads to: "after Bxc1 Rfxc1, Bxc4", "once the queens come off, Rxe7", "Black plays Bxc6 and later b4, which". */
function leadText(say: Say, lead: Lead, san: string, voice: Voice): string {
  const move = say.move.san;
  if (!lead) return voice.opening ? `After ${move}, ${san}` : san;
  if ('after' in lead) return voice.opening ? `After ${move} ${lead.after}, ${san}` : `after ${lead.after}, ${san}`;
  if ('once' in lead) return `${voice.opening ? `After ${move}, once` : 'once'} ${lead.once}, ${san}`;
  if (!lead.theirs.length) return voice.opening ? `After ${move}, ${san}` : san;
  const plays = `${say.them} plays ${lead.theirs[0].san} and ${lead.theirs.length > 1 ? 'later' : 'then'} ${san}, which`;
  return voice.opening ? `After ${move}, ${plays}` : plays;
}

/**
 * What the opponent plays and what it costs the user, as a clause: "Nc7+ checks your king and attacks your rook
 * on a8 at once, and Nxa8 takes the rook", "after Bxc1 Rfxc1, Bxc4 wins your knight on c4".
 */
export function clause(say: Say, caught: Caught, voice: Voice): string {
  const { t } = caught;
  if (t.id === 'checkmate') return t.key === 0 ? `${mateMove(t)} is checkmate` : `${t.moves[0].san} leads to mate`;
  const pattern = patternVerb(say, caught, voice);
  const at = pattern ? t.at : t.key;
  const lead = leadTo(say, t, 0, at);
  if (lead && 'theirs' in lead && hidesCaptures(t, at)) return attackText(say, caught, voice);
  const told = `${leadText(say, lead, mover(say, t.moves[at]), voice)} `;
  return told + (pattern ?? rest(say, caught, voice, keyVerb(say, caught, voice)));
}

/** "Bxc4", or "the knight on c6 takes back and" when the move is written like the user's own. */
function mover(say: Say, move: Move): string {
  if (move.san !== say.move.san) return move.san;
  return `${refer({ square: move.from, type: move.piece, color: move.color }, say.user)} takes back and`;
}

/** The user's moves left unsaid before `at` take something, or the move at `at` does, so the opponent's moves alone would mislead. */
function hidesCaptures(t: Tactic, at: number): boolean {
  return t.moves[at].captured !== undefined || t.moves.slice(0, at).some((m) => m.color !== t.side && m.captured);
}

/** "Bf4 attacks your queen on d6, and you end up losing a rook for a pawn": a long line told by its first move and its cost. */
function attackText(say: Say, { t, cost }: Caught, voice: Voice): string {
  const [reply] = t.moves;
  const hit = attacked(say, reply);
  const does = hit.length ? `attacks ${listOf(hit)}` : 'starts the attack';
  const start = voice.opening ? `After ${say.move.san}, ${reply.san}` : reply.san;
  return `${start} ${does}, and you end up losing ${lossText(say, cost, voice)}`;
}

/** The user's pieces other than the king that the reply attacks, as "your queen on d6"; pawns left out. */
export function attacked(say: Say, reply: Move): string[] {
  const chess = new Chess(reply.after);
  return chess
    .board()
    .flat()
    .flatMap((p) => (p && p.color === say.user && p.type !== 'p' && p.type !== 'k' ? [p] : []))
    .filter((p) => chess.attackers(p.square, otherColor(say.user)).includes(reply.to))
    .map((p) => refer({ square: p.square, type: p.type, color: p.color }, say.user));
}

/** The key capture as a verb phrase: "wins your queen on d5", "takes your rook on f8", "takes your bishop on c4 in return". */
function keyVerb(say: Say, caught: Caught, voice: Voice, it?: string): string {
  const { t, cost } = caught;
  const capture = t.moves[t.key];
  const ref = it ?? keyPiece(t, say.user);
  if (!cost.trade.won.includes(keyType(t))) return `takes ${ref} in return`;
  const promotes = capture.promotion ? ` and makes a new ${NAME[capture.promotion]}` : '';
  const forked = cost.forked.map((p) => refer({ ...p, color: say.user }, say.user));
  const hits = forked.length ? ` and then attacks ${listOf(forked)} at once` : '';
  const wins = onlyNamed(say, caught, voice) && !losesExchange(say, caught, voice);
  return `${wins ? 'wins' : 'takes'} ${ref}${promotes}${hits}`;
}

/** The named pieces are all the line costs, and nothing comes back. */
function onlyNamed(say: Say, caught: Caught, voice: Voice): boolean {
  return !gotBack(say, caught.cost, voice).length && sameTypes(caught.cost.trade.won, piecesNamed(caught));
}

/** A verb phrase followed by the later captures, what the user ends up with, and an attack that goes on. */
function rest(say: Say, caught: Caught, voice: Voice, verb: string): string {
  const attack = attackGoesOn(say, caught) ? ', and the attack on your king goes on' : '';
  return `${verb}${thenText(say, caught)}${netText(say, caught, voice)}${attack}`;
}

/** The checks go on, or they come with an evaluation far below what the material left would give. */
function attackGoesOn(say: Say, { t, cost }: Caught): boolean {
  const checks = t.moves.slice(t.key).some((m) => m.color === t.side && m.san.includes('+'));
  return cost.checks || (checks && say.after < say.turn.material - cost.trade.net - UNEXPLAINED);
}

/** Later captures the move leads to: ", and dxc5 then takes your knight on c5". */
function thenText(say: Say, { cost }: Caught): string {
  return cost.then.map((m) => `, and ${m.san} then takes ${capturedRef(say, m)}`).join('');
}

export function capturedRef(say: Say, capture: Move): string {
  return refer({ square: capturedSquare(capture), type: capture.captured!, color: say.user }, say.user);
}

/** What the user ends up with when it isn't just the named pieces: ", and you get only a knight for it". */
function netText(say: Say, caught: Caught, voice: Voice): string {
  const { cost } = caught;
  const back = gotBack(say, cost, voice);
  const lost = cost.trade.won;
  if (!lost.length) return '';
  if (losesExchange(say, caught, voice)) return ', and you lose the exchange';
  if (onlyNamed(say, caught, voice)) return '';
  const what = !cost.then.length && sameTypes(lost, [keyType(caught.t)]) ? 'it' : yours(lost);
  return back.length ? `, and you get only ${some(back)} for ${what}` : `, and you lose ${yours(lost)} in all`;
}

/** A rook given for a knight or a bishop, the minor piece perhaps being the one the move grabbed. */
function losesExchange(say: Say, { cost }: Caught, voice: Voice): boolean {
  const back = gotBack(say, cost, voice);
  return isExchange(cost.trade.won, voice.grabbed && !back.length && say.move.captured ? [say.move.captured] : back);
}

/** The pieces the clause names as taken: the key piece and the later captures. */
function piecesNamed({ t, cost }: Caught): PieceSymbol[] {
  const key = cost.trade.won.includes(keyType(t)) ? [keyType(t)] : [];
  const first = takesFirst(t) && isPattern(t) ? [t.moves[t.at].captured!] : [];
  return [...first, ...key, ...cost.then.map((m) => m.captured!)];
}

/** Whether the clause names the tactic's pattern rather than telling a plain capture. */
function isPattern(t: Tactic): boolean {
  if (t.id === 'pin') return t.how === 'created' || t.how === 'attacked';
  if (t.id === 'discovered-attack') return t.at === 0;
  return ['fork', 'skewer', 'trapped-piece', 'remove-defender'].includes(t.id);
}

function sameTypes(a: PieceSymbol[], b: PieceSymbol[]): boolean {
  return [...a].sort().join() === [...b].sort().join();
}

function isExchange(lost: PieceSymbol[], back: PieceSymbol[]): boolean {
  return lost.length === 1 && lost[0] === 'r' && back.length === 1 && (back[0] === 'n' || back[0] === 'b');
}

/** "a rook for a pawn", "the exchange" */
function lossText(say: Say, cost: Cost, voice: Voice): string {
  const back = gotBack(say, cost, voice);
  if (isExchange(cost.trade.won, back)) return 'the exchange';
  return `${yours(cost.trade.won)}${back.length ? ` for ${some(back)}` : ''}`;
}

/** A pattern as a verb phrase with what it wins, or null for a plain capture. */
function patternVerb(say: Say, caught: Caught, voice: Voice): string | null {
  const { t } = caught;
  const ref = (p: PieceAt) => refer(p, say.user);
  const takes = () => keyAfterPattern(say, caught, voice);
  const taken = takesFirst(t) ? [`takes ${capturedRef(say, t.moves[t.at])}`] : [];
  const first = taken.length ? `${taken[0]} and ` : '';
  switch (t.id) {
    case 'fork': {
      const check = t.targets.some((p) => p.type === 'k') ? ['checks your king'] : [];
      const hits = `attacks ${listOf(t.targets.filter((p) => p.type !== 'k').map(ref))}`;
      return `${listOf([...taken, ...check, hits])} at once${takes()}`;
    }
    case 'pin':
      if (t.how === 'created') return `${first}pins ${ref(t.pin.pinned)} to ${ref(t.pin.behind)}${takes()}`;
      if (t.how === 'attacked') return `${first}attacks ${ref(t.pin.pinned)}, which is pinned to ${ref(t.pin.behind)}${takes()}`;
      if (t.how !== 'defender' || t.at !== t.key) return null;
      return `${keyVerb(say, caught, voice)}, because ${ref(t.pin.pinned)} is pinned to ${ref(t.pin.behind)} and can't take back${rest(say, caught, voice, '')}`;
    case 'skewer':
      return `${first}attacks ${ref(t.front)} with ${ref(t.back)} behind it${takes()}`;
    case 'discovered-attack': {
      if (t.at !== 0) return null;
      const opens = t.target.type === 'k' ? `uncovers check from ${ref(t.slider)}` : `opens the line from ${ref(t.slider)} to ${ref(t.target)}`;
      return t.at === t.key ? `${keyVerb(say, caught, voice)} and ${opens}${rest(say, caught, voice, '')}` : `${first}${opens}${takes()}`;
    }
    case 'trapped-piece':
      return `${first}traps ${ref(t.trapped)}${takes()}`;
    case 'remove-defender': {
      const guard = `${ref(t.defender)}, which guards ${ref(t.guarded)}`;
      if (t.how === 'chase') return `${first}drives away ${guard}${takes()}`;
      if (t.how === 'deflect') return `${first}lures ${ref(t.defender)} away from guarding ${ref(t.guarded)}${takes()}`;
      const tradedOff = t.moves[t.at + 1]?.to === t.moves[t.at].to;
      return `${tradedOff ? 'trades off' : 'takes'} ${guard}${takes()}`;
    }
    case 'mate-threat':
      return `threatens mate on ${t.mate.to}, and stopping it costs you ${lossText(say, caught.cost, voice)}`;
    default:
      return null;
  }
}

/** The move that makes the pattern also takes something that isn't taken back, so the sentence says so first. */
function takesFirst(t: Tactic): boolean {
  const move = t.moves[t.at];
  const guardTaken = t.id === 'remove-defender' && t.how === 'capture';
  return t.at < t.key && Boolean(move.captured) && t.moves[t.at + 1]?.to !== move.to && !guardTaken;
}

/** ", and Nxa8 takes the rook" after a pattern that names the key piece, ", and after Qxf2, Rxf2+ takes your queen on f2" otherwise. */
function keyAfterPattern(say: Say, caught: Caught, voice: Voice): string {
  const { t } = caught;
  if (t.at === t.key) return rest(say, caught, voice, '');
  const square = capturedSquare(t.moves[t.key]);
  const named = patternPieces(t).includes(square) || t.won?.square === square;
  const verb = keyVerb(say, caught, voice, named ? `the ${NAME[keyType(t)]}` : undefined);
  const lead = leadTo(say, t, t.at + 1, t.key);
  const between = lead && 'after' in lead ? `after ${lead.after}, ` : '';
  return `, and ${between}${t.moves[t.key].san} ${rest(say, caught, voice, verb)}`;
}

/** The user's pieces a pattern names, where they stand when it is played. */
function patternPieces(t: Tactic): string[] {
  switch (t.id) {
    case 'fork':
      return t.targets.map((p) => p.square);
    case 'skewer':
      return [t.front.square, t.back.square];
    case 'pin':
      return [t.pin.pinned.square, t.pin.behind.square];
    case 'trapped-piece':
      return [t.trapped.square];
    default:
      return [];
  }
}

/** The pieces the user gets for what the line takes, less the piece the text has already said the move grabbed. */
function gotBack(say: Say, cost: Cost, voice: Voice): PieceSymbol[] {
  const back = [...cost.trade.lost];
  const i = voice.grabbed && say.move.captured ? back.indexOf(say.move.captured) : -1;
  if (i >= 0) back.splice(i, 1);
  return back;
}

function keyType(t: Tactic): PieceSymbol {
  return t.moves[t.key].captured!;
}

/** "your rook on f8": the piece the key capture takes, where it is taken. */
function keyPiece(t: Tactic, user: Color): string {
  return refer({ square: capturedSquare(t.moves[t.key]), type: keyType(t), color: user }, user);
}

/** "a knight", "a bishop and a pawn", "two pawns", biggest first. */
function some(types: PieceSymbol[]): string {
  return listOf(counted(types).map(([type, n]) => (n > 1 ? `${COUNT[n]} ${NAME[type]}s` : `a ${NAME[type]}`)));
}

/** "your queen", "your rook and a pawn", "two pawns". */
function yours(types: PieceSymbol[]): string {
  return listOf(counted(types).map(([type, n], i) => (n > 1 ? `${COUNT[n]} ${NAME[type]}s` : `${i === 0 ? 'your' : 'a'} ${NAME[type]}`)));
}

function counted(types: PieceSymbol[]): [PieceSymbol, number][] {
  const counts = new Map<PieceSymbol, number>();
  for (const type of [...types].sort((a, b) => VALUE[b] - VALUE[a])) counts.set(type, (counts.get(type) ?? 0) + 1);
  return [...counts];
}
