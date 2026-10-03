import { Chess } from 'chess.js';
import type { BarScore } from '../board/types';
import { fenAfter } from '../pause/position';
import type { Line } from './engine';
import { playedNote, rowsFor, sideToMove, verdict, type Row } from './explain';
import { forMover, forWhite, isMated } from './score';

/** Engine lines known for a position, if any. */
export type Lookup = (fen: string) => Line[] | undefined;

/** The move a line plays at a position: what the analysis there is measured against. */
export interface LineMove {
  fen: string;
  uci: string;
}

export type Ending = 'checkmate' | 'stalemate' | 'draw';

export function endingOf(fen: string): Ending | null {
  const chess = new Chess(fen);
  if (chess.isCheckmate()) return 'checkmate';
  if (chess.isStalemate()) return 'stalemate';
  if (chess.isInsufficientMaterial()) return 'draw';
  return null;
}

/** Lines for a finished game, which the engine is never asked about. */
export function finishedLines(fen: string): Line[] | null {
  const ending = endingOf(fen);
  if (!ending) return null;
  return [{ pv: [], score: ending === 'checkmate' ? { mate: 0 } : { cp: 0 }, depth: 0 }];
}

const listed = (lines: Line[] | undefined, uci: string) => lines?.find((line) => line.pv[0] === uci);

/** The line that starts with `uci`: the engine's own when it listed the move, else the move and the best answer to it. */
export function lineOf(lookup: Lookup, before: string, uci: string): Line | null {
  const own = listed(lookup(before), uci);
  if (own) return own;
  const [reply] = lookup(fenAfter(before, [uci])) ?? [];
  return reply ? { pv: [uci, ...reply.pv], score: forMover(reply.score), depth: reply.depth } : null;
}

export interface Reference {
  line: Line;
  /** The line's own move rather than the engine's best. */
  isPlayed: boolean;
}

/** What moves at `fen` are measured against: the line's move where it has one, else the engine's best. */
export function referenceAt(lookup: Lookup, fen: string, lineMove?: LineMove): Reference | null {
  const [best] = lookup(fen) ?? [];
  if (!best?.pv.length) return null;
  if (lineMove?.fen !== fen) return { line: best, isPlayed: false };
  const line = lineOf(lookup, fen, lineMove.uci);
  return line ? { line, isPlayed: true } : null;
}

/** The reference first, then up to two of the engine's other choices. */
export function rowsAt(lookup: Lookup, fen: string, reference: Reference | null): Row[] {
  const lines = lookup(fen);
  if (!reference || !lines?.[0]) return [];
  const others = lines.filter((line) => line.pv.length && line.pv[0] !== reference.line.pv[0]).slice(0, 2);
  return rowsFor(fen, reference.line, others, lines[0]);
}

/** The verdict on a move tried from `before`, once the engine has looked at both sides of it. */
export function verdictAt(lookup: Lookup, before: string, uci: string, lineMove?: LineMove): string | null {
  const reference = referenceAt(lookup, before, lineMove);
  const mine = lineOf(lookup, before, uci);
  return reference && mine ? verdict(before, reference.line, mine, reference.isPlayed) : null;
}

/** What the engine makes of the line's move, once it has looked. */
export function noteAt(lookup: Lookup, lineMove: LineMove): string | null {
  const reference = referenceAt(lookup, lineMove.fen, lineMove);
  const [best] = lookup(lineMove.fen) ?? [];
  return reference && best ? playedNote(lineMove.fen, reference.line, best) : null;
}

export function barScoreAt(lookup: Lookup, fen: string): BarScore | null {
  const [best] = lookup(fen) ?? [];
  if (!best) return null;
  const side = sideToMove(fen);
  if (!best.pv.length && isMated(best.score)) return { winner: side === 'w' ? 'b' : 'w' };
  return forWhite(best.score, side);
}

/**
 * The next position to send to the engine, most needed first: the one on show, then the one before the
 * last move for its verdict; where a line's move is not among the engine's choices, the position after it too.
 */
export function nextToAnalyse(lookup: Lookup, here: string, before: string | null, lineMove?: LineMove): string | null {
  for (const fen of before ? [here, before] : [here]) {
    const lines = lookup(fen);
    if (!lines) return fen;
    if (lineMove?.fen !== fen || listed(lines, lineMove.uci)) continue;
    const after = fenAfter(fen, [lineMove.uci]);
    if (!lookup(after)) return after;
  }
  return null;
}
