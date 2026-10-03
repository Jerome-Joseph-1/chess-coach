import { Chess, type Square } from 'chess.js';
import { NAME } from '../board/captions';
import type { Game } from '../content/types';
import { lessonFor, type Role, type Theme, type ThemeId, type ThemePiece } from '../learn';
import { isLoose, pinOn } from '../learn/board';
import type { FlowState } from './flow';

export interface HintLadder {
  /** The rungs, in the order the hint button climbs them. */
  stops: string[];
  /** Rungs already shown. */
  used: number;
}

const FULL = ['Idea', 'Piece', 'Move'];
/** Follow-up moves have no pattern of their own, so their ladder starts at the piece. */
const FOLLOW_UP = ['Piece', 'Move'];
const NO_HINTS_LEFT = 'No hints left';

export function hintLadder(state: FlowState): HintLadder {
  // A reply always leads to a follow-up move.
  if (state.phase === 'hold' || state.phase === 'reply') return { stops: FOLLOW_UP, used: Math.max(0, state.hint - 1) };
  return { stops: FULL, used: state.hint };
}

/** What the next tap shows, e.g. "Hint: the piece". */
export function hintButtonLabel({ stops, used }: HintLadder): string {
  return used < stops.length ? `Hint: the ${stops[used].toLowerCase()}` : NO_HINTS_LEFT;
}

export interface Trouble {
  squares: Square[];
  /** What to look at and why, e.g. "Look at Black's knight on a5: it can be trapped." */
  text: string;
}

/** Whose piece is in trouble, in the order the second hint looks for it. */
const TROUBLE_ROLES: Role[] = ['trapped', 'pinned', 'defender', 'target'];
const MAX_POINTED = 2;

function standsThere(board: Chess, piece: ThemePiece): boolean {
  const found = board.get(piece.square);
  return found?.type === piece.type && found.color === piece.color;
}

function owner(piece: ThemePiece, game: Game): string {
  if (piece.color === game.side) return 'your';
  return piece.color === 'w' ? "White's" : "Black's";
}

function listed(words: string[]): string {
  return words.length > 1 ? `${words.slice(0, -1).join(', ')} and ${words.at(-1)}` : words[0];
}

/** "Black's knight on c6", "your rook on a8 and knight on g3", "your rooks on c8 and e2". */
function named(pieces: ThemePiece[], game: Game): string {
  const [first] = pieces;
  const whose = owner(first, game);
  if (pieces.length > 1 && pieces.every((p) => p.type === first.type)) {
    return `${whose} ${NAME[first.type]}s on ${listed(pieces.map((p) => p.square))}`;
  }
  return `${whose} ${listed(pieces.map((p) => `${NAME[p.type]} on ${p.square}`))}`;
}

/** What is weak about how a piece is guarded; null for a king or a piece guarded well enough. */
function guardReason(board: Chess, piece: ThemePiece): string | null {
  if (piece.type === 'k') return null;
  if (board.attackers(piece.square, piece.color).length === 0) return 'nothing guards it';
  return isLoose(board.fen(), piece.square) ? "it isn't defended enough" : null;
}

function pinReason(board: Chess, piece: ThemePiece): string {
  return pinOn(board, piece.square) ? "it's pinned" : 'it can be pinned';
}

/** The piece a defender guards, when the board shows it doing so. */
function guardedBy(theme: Theme, board: Chess, defender: ThemePiece): string | null {
  const guarded = theme.pieces.find((p) => p.role === 'target' && standsThere(board, p));
  if (!guarded || !board.attackers(guarded.square, defender.color).includes(defender.square)) return null;
  return `it guards the ${NAME[guarded.type]} on ${guarded.square}`;
}

const KING_REASONS: Partial<Record<ThemeId, string>> = {
  checkmate: 'it can be checkmated',
  'mate-threat': 'you can threaten mate',
  'discovered-attack': 'moving one piece can uncover a check on it',
};

/** Why an enemy target is worth a look: how it can be won, without the move that wins it. */
function targetReason(pieces: ThemePiece[], theme: Theme, board: Chess): string {
  if (pieces.length > 1) return theme.id === 'skewer' ? 'they stand on one line' : 'one move can attack both';
  const [piece] = pieces;
  if (theme.id === 'fork') return 'one move can attack it and another piece';
  if (piece.type === 'k') return KING_REASONS[theme.id] ?? "it's in danger";
  if (theme.id === 'discovered-attack') return 'moving one piece can uncover an attack on it';
  return guardReason(board, piece) ?? 'it can be won';
}

function enemyReason(pieces: ThemePiece[], role: Role, theme: Theme, board: Chess): string {
  const [piece] = pieces;
  if (role === 'trapped') return 'it can be trapped';
  if (role === 'pinned') return pinReason(board, piece);
  if (role === 'defender') return guardedBy(theme, board, piece) ?? "it's an important defender";
  return targetReason(pieces, theme, board);
}

/** Why the user's own piece is in danger, when there is more to say than that. */
function ownReason(pieces: ThemePiece[], role: Role, theme: Theme, board: Chess): string | null {
  const [piece] = pieces;
  if (pieces.length > 1) return null;
  if (role === 'trapped') return 'it can be trapped';
  if (role === 'pinned') return pinReason(board, piece);
  if (role === 'defender') return guardedBy(theme, board, piece);
  return guardReason(board, piece);
}

/** The second hint: what to look at and why, true for the piece's part in the idea and never naming the move. */
function troubleText(pieces: ThemePiece[], role: Role, theme: Theme, board: Chess, game: Game): string {
  const who = named(pieces, game);
  const them = pieces.length > 1 ? 'them' : 'it';
  if (pieces[0].color !== game.side) return `Look at ${who}: ${enemyReason(pieces, role, theme, board)}.`;
  if (theme.id === 'bait') return `Careful with ${who}: a tempting move puts ${them} in danger.`;
  const subject = `${who[0].toUpperCase()}${who.slice(1)} ${pieces.length > 1 ? 'are' : 'is'} in danger`;
  const reason = ownReason(pieces, role, theme, board);
  return reason ? `${subject}: ${reason}.` : `${subject}.`;
}

/**
 * The piece the position is about, rather than the piece to move: the trapped, pinned or attacked piece
 * of the lesson, as it stands on the board now. Null when the lesson names none that is there.
 */
export function pieceInTrouble(game: Game, turnIndex: number): Trouble | null {
  const { theme } = lessonFor(game, turnIndex);
  const board = new Chess(game.turns[turnIndex].fen);
  for (const role of TROUBLE_ROLES) {
    const found = theme.pieces.filter((p) => p.role === role && standsThere(board, p));
    const pieces = uniqueSquares(found.filter((p) => p.color === found[0].color)).slice(0, MAX_POINTED);
    if (pieces.length) return { squares: pieces.map((p) => p.square), text: troubleText(pieces, role, theme, board, game) };
  }
  return null;
}

function uniqueSquares(pieces: ThemePiece[]): ThemePiece[] {
  return pieces.filter((p, i) => pieces.findIndex((q) => q.square === p.square) === i);
}
