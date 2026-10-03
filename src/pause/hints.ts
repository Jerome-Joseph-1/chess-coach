import { Chess, type Square } from 'chess.js';
import { NAME } from '../board/captions';
import type { Game } from '../content/types';
import { lessonFor, type Role, type ThemePiece } from '../learn';
import type { FlowState } from './flow';

export interface HintLadder {
  /** The rungs, in the order the hint button climbs them. */
  stops: string[];
  /** Rungs already shown. */
  used: number;
}

const FULL = ['Pattern', 'Piece', 'Move'];
/** Follow-up moves have no pattern of their own, so their ladder starts at the piece. */
const FOLLOW_UP = ['Piece', 'Move'];

export function hintLadder(state: FlowState): HintLadder {
  // A reply always leads to a follow-up move.
  if (state.phase === 'hold' || state.phase === 'reply') return { stops: FOLLOW_UP, used: Math.max(0, state.hint - 1) };
  return { stops: FULL, used: state.hint };
}

/** "Hint · 1 of 3": the rung the next tap shows; the last one stays named once it is used. */
export function hintButtonLabel({ stops, used }: HintLadder): string {
  return `Hint · ${Math.min(used + 1, stops.length)} of ${stops.length}`;
}

export interface Trouble {
  squares: Square[];
  /** "It's Black's knight on a5." */
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

function describe(pieces: ThemePiece[], game: Game): string {
  const named = pieces.map((p) => `${NAME[p.type]} on ${p.square}`);
  const list = named.length > 1 ? `${named.slice(0, -1).join(', ')} and ${named.at(-1)}` : named[0];
  return `It's ${owner(pieces[0], game)} ${list}.`;
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
    if (pieces.length) return { squares: pieces.map((p) => p.square), text: describe(pieces, game) };
  }
  return null;
}

function uniqueSquares(pieces: ThemePiece[]): ThemePiece[] {
  return pieces.filter((p, i) => pieces.findIndex((q) => q.square === p.square) === i);
}
