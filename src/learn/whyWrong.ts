import { Chess, type Color, type Move, type PieceSymbol, type Square } from 'chess.js';
import { NAME } from '../board/captions';
import type { Game, Turn } from '../content/types';
import type { HintLevel } from '../pause/flow';
import { VALUE, kingOf, otherColor, passTurn, playLine, uciOf, type PieceAt } from './board';
import { ideaOf, replyText } from './ideas';
import { tacticIn, type Tactic, type TacticId } from './tactics';
import { punishment, type Role, type Theme } from './themes';
import type { Trade } from './trade';
import { colorName, listOf, refer, tradeText } from './words';

/**
 * blunder: the stored punishing line wins material or mates.
 * bait: the move is the position's common mistake.
 * ignores-threat: a defend position, and the punishing line is the opponent's threat.
 * weaker: loses under 10% and costs nothing.
 * missed: loses 10% or more but no material: the chance just goes.
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
/** The user's pieces a punishing line goes after. */
const TARGET_ROLES: Role[] = ['target', 'pinned', 'behind', 'trapped'];
const COUNT = ['', 'a', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight'];
const MINORS: PieceSymbol[] = ['n', 'b'];

/** What every sentence about one wrong move needs. */
interface Say {
  user: Color;
  /** The opponent, "White" or "Black". */
  them: string;
  /** The wrong move, as played. */
  move: Move;
}

/**
 * Why `uci` is wrong at this key position, from what the move actually loses, told only as far as the hints
 * given allow. It reads the stored punishing lines, never the best line or the game's move.
 */
export function whyWrong(game: Game, turnIndex: number, uci: string, hint: HintLevel): WrongMove {
  const turn = game.turns[turnIndex];
  const [move] = playLine(turn.fen, [uci]);
  if (turn.grades[uci] === undefined || !move) return plain('unknown');
  const found = classify(turn, { user: game.side, them: colorName(otherColor(game.side)), move }, hint);
  // With the move drawn on the board, there is nothing left to explain.
  return hint >= 3 ? plain(found.kind) : found;
}

function plain(kind: WrongKind): WrongMove {
  return { kind, text: FALLBACK, reply: null, targets: [] };
}

function classify(turn: Turn, say: Say, hint: HintLevel): WrongMove {
  const uci = uciOf(say.move);
  const refutation = turn.refutations[uci] ?? [];
  const caught = punishment(turn.fen, uci, refutation, say.user);
  if (ignoresThreat(turn, say.user, refutation)) return threatIgnored(say, caught, refutation, hint >= 2);
  const bait = uci === turn.mistakeMove ? baitWrong(turn, say) : null;
  if (bait) return bait;
  if (caught?.tactic) return punished('blunder', caught, caught.tactic, blunderText(say, caught.tactic));
  return turn.grades[uci] < MISS ? weaker(say) : missed(turn, say);
}

/** A defend position whose punishing line starts with the threat the user was asked to meet. */
function ignoresThreat(turn: Turn, user: Color, refutation: string[]): boolean {
  if (!turn.kinds.includes('defend') || !refutation.length) return false;
  return threatMoves(turn, user).includes(refutation[0]);
}

const threats = new WeakMap<Turn, string[]>();

/** The moves that carry out the opponent's threat: the threat line's first move, and its tactic's moves. */
function threatMoves(turn: Turn, user: Color): string[] {
  const known = threats.get(turn);
  if (known) return known;
  const threat = turn.lines.threat ?? [];
  const passed = passTurn(turn.fen);
  const tactic = passed && threat.length ? tacticIn(passed, threat, otherColor(user)) : null;
  const moves = [...threat.slice(0, 1), ...(tactic ? [tactic.moves[tactic.at], tactic.moves[tactic.key]].map(uciOf) : [])];
  threats.set(turn, moves);
  return moves;
}

/** Says only that the threat still stands, until a hint has pointed at what it is after. */
function threatIgnored(say: Say, caught: Theme | null, refutation: string[], named: boolean): WrongMove {
  const t = caught?.tactic;
  const lead = `That doesn't stop ${say.them}'s threat`;
  if (!named) return { kind: 'ignores-threat', text: `${lead}.`, reply: null, targets: [], pattern: t?.id };
  if (!t) {
    const [reply] = playLine(say.move.after, refutation.slice(0, 1));
    return { kind: 'ignores-threat', text: `${lead}.`, reply: reply ? uciOf(reply) : null, targets: [] };
  }
  return punished('ignores-threat', caught!, t, `${lead}: ${threatClause(t, say.user)}.`);
}

/** "Bxf2+ checks your king and attacks your rook at once"; a longer line names only the opponent's moves. */
function threatClause(t: Tactic, user: Color): string {
  if (t.id === 'checkmate' && t.key === 0) return `${mateMove(t)} is checkmate`;
  return isLong(t) ? `${theirMoves(t)}, ${whatItDoes(t, user)}` : replyText(t, user);
}

/** A tactic that takes a few moves to play out: spelling them all would name the user's own replies. */
function isLong(t: Tactic): boolean {
  return t.at > 0 || (t.id === 'material-win' && t.key > 0);
}

function mateMove(t: Tactic): string {
  return t.moves[t.key].san.replace('#', '');
}

/** The position's common mistake, told the way the lesson tells it, when its line really costs something. */
function baitWrong(turn: Turn, say: Say): WrongMove | null {
  const uci = uciOf(say.move);
  const stored = turn.lines.mistake?.[0] === uci ? turn.lines.mistake.slice(1) : turn.refutations[uci];
  const theme = punishment(turn.fen, uci, stored ?? [], say.user);
  const t = theme?.tactic;
  if (!t) return null;
  const text = isLong(t)
    ? `${tempting(say.move)}, but ${say.them} answers ${theirMoves(t)}, ${whatItDoes(t, say.user)}.`
    : ideaOf(theme!, say.user, { fen: turn.fen });
  return punished('bait', theme!, t, text);
}

/** "Bxf7+ grabs a pawn", "Qd7 looks natural": how the lesson opens a trap. */
function tempting(move: Move): string {
  if (!move.captured) return `${move.san} looks natural`;
  return `${move.san} grabs ${move.captured === 'p' ? 'a pawn' : `the ${NAME[move.captured]}`}`;
}

/** The reply on the board and the user's pieces it goes after, where they stand once the reply is played. */
function punished(kind: WrongKind, theme: Theme, t: Tactic, text: string): WrongMove {
  const [reply] = t.moves;
  const board = new Chess(reply.after);
  const user = otherColor(t.side);
  const pieces: PieceAt[] = theme.pieces.filter((p) => TARGET_ROLES.includes(p.role) && p.color === user);
  // A mate goes after the king wherever it stands; a piece the reply has just taken is marked where it stood.
  const king = t.id === 'checkmate' ? [kingOf(board, user)] : [];
  const stands = (p: PieceAt) => board.get(p.square)?.type === p.type && board.get(p.square)?.color === p.color;
  const shown = [...king, ...pieces, ...(t.won ? [t.won] : [])].filter((p) => stands(p) || p.square === reply.to);
  return { kind, text, reply: uciOf(reply), targets: [...new Set(shown.map((p) => p.square))], pattern: t.id };
}

function blunderText({ them, move }: Say, t: Tactic): string {
  const after = `After ${move.san}`;
  if (t.id === 'checkmate') {
    if (t.key === 0) return `${after}, ${mateMove(t)} is checkmate.`;
    return `${after}, ${them} has a forced mate that starts with ${t.moves[0].san}.`;
  }
  return `${after}, ${them} plays ${theirMoves(t)}, ${whatItDoes(t, otherColor(t.side))}.`;
}

/** The opponent's moves up to the one that makes the tactic: "Bxc3+", "Bxc3+ and then Qa5"; the user's replies go unsaid. */
function theirMoves(t: Tactic): string {
  const first = t.moves[0].san;
  if (t.at === 0) return first;
  return `${first} and ${t.at === 2 ? 'then' : 'later'} ${t.moves[t.at].san}`;
}

/** "a fork that wins your rook", from the side of the user, whose pieces the line takes. */
function whatItDoes(t: Tactic, user: Color): string {
  const trade = withoutMinorSwaps(t.trade);
  const loss = lossText(trade);
  switch (t.id) {
    case 'fork':
      return `a fork that wins ${loss}`;
    case 'pin':
      return `a pin that wins ${loss}`;
    case 'skewer':
      return `a skewer that wins ${loss}`;
    case 'discovered-attack':
      return `a discovered ${t.target.type === 'k' ? 'check' : 'attack'} that wins ${loss}`;
    case 'mate-threat':
      return `threatening mate, and it wins ${loss}`;
    case 'trapped-piece': {
      const traps = `which traps ${refer(t.trapped, user)}`;
      return onlyLoses(trade, t.trapped.type) ? traps : `${traps} and wins ${lossText(trade, t.trapped.type)}`;
    }
    case 'remove-defender':
      return `which removes a defender and wins ${loss}`;
    case 'free-piece':
      return t.won && onlyLoses(trade, t.won.type) ? `taking ${refer(t.won, user)} for free` : `which wins ${loss}`;
    case 'checkmate':
      return `which leads to mate`;
    default:
      return t.key > 0 ? `and the line that follows wins ${loss}` : `which wins ${loss}`;
  }
}

/** A knight given for a bishop, or the other way round, costs nothing, so it goes unsaid. */
function withoutMinorSwaps(trade: Trade): Trade {
  const won = [...trade.won];
  const lost = trade.lost.filter((type) => {
    const swapped = MINORS.includes(type) ? won.findIndex((other) => MINORS.includes(other)) : -1;
    if (swapped >= 0) won.splice(swapped, 1);
    return swapped < 0;
  });
  return { ...trade, won, lost };
}

/** The line costs the user exactly one piece of this type and nothing comes back. */
function onlyLoses(trade: Trade, type: PieceSymbol): boolean {
  return trade.won.length === 1 && trade.won[0] === type && !trade.lost.length && !trade.promoted.length;
}

/**
 * What the user loses over the whole line, counted from its captures: "your rook", "your queen and a pawn",
 * "two pawns for a knight"; a piece already named can be "it".
 */
function lossText(trade: Trade, named?: PieceSymbol): string {
  if (!trade.won.length) return 'material';
  const counts = new Map<PieceSymbol, number>();
  for (const type of [...trade.won].sort((a, b) => VALUE[b] - VALUE[a])) counts.set(type, (counts.get(type) ?? 0) + 1);
  const one = (type: PieceSymbol, i: number) => (i > 0 ? `a ${NAME[type]}` : type === named ? 'it' : `your ${NAME[type]}`);
  const parts = [...counts].map(([type, n], i) => (n > 1 ? `${COUNT[n]} ${NAME[type]}s` : one(type, i)));
  parts.push(...trade.promoted.map((type) => `a new ${NAME[type]}`));
  const back = trade.lost.length ? ` for ${tradeText({ ...trade, won: trade.lost, lost: [], promoted: [] })}` : '';
  return listOf(parts) + back;
}

function weaker({ move }: Say): WrongMove {
  return { kind: 'weaker', text: `${move.san} is safe, but there's a stronger move here.`, reply: null, targets: [] };
}

/** Nothing is lost, but the move gives up what the position offered. */
function missed(turn: Turn, { move, them }: Say): WrongMove {
  const safe = `${move.san} is safe, but`;
  const text = turn.kinds.includes('win')
    ? `${safe} it lets the chance go.`
    : turn.kinds.includes('defend')
      ? `${safe} there's a better answer to ${them}'s threat.`
      : `${safe} there's a much stronger move here.`;
  return { kind: 'missed', text, reply: null, targets: [] };
}
