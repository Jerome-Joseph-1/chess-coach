import type { Side } from '../content/types';

/**
 * An engine score from one side's point of view: centipawns, or mate in `mate` moves,
 * negative when that side is the one getting mated (0: it is mated already).
 */
export type Score = { cp: number } | { mate: number };

const MATE_CP = 100_000;
const MINUS = '−';

export const isMate = (score: Score): score is { mate: number } => 'mate' in score;

const negate = (cp: number): number => (cp === 0 ? 0 : -cp);

/** The side mates. */
export const mates = (score: Score): boolean => isMate(score) && score.mate > 0;

/** The side gets mated. */
export const isMated = (score: Score): boolean => isMate(score) && score.mate <= 0;

/** One number that orders scores: any mate beats any centipawn score, and a quicker mate beats a slower one. */
export function scoreValue(score: Score): number {
  if (!isMate(score)) return score.cp;
  return score.mate > 0 ? MATE_CP - score.mate : -MATE_CP - score.mate;
}

/** The score before a move, for the side that played it, given the score of the side that answers. */
export function forMover(reply: Score): Score {
  if (!isMate(reply)) return { cp: negate(reply.cp) };
  return reply.mate > 0 ? { mate: -reply.mate } : { mate: -reply.mate + 1 };
}

/** The same score from White's point of view. */
export function forWhite(score: Score, side: Side): Score {
  if (side === 'w') return score;
  return isMate(score) ? { mate: -score.mate } : { cp: negate(score.cp) };
}

/** Pawns with one decimal and a sign: "+1.8", "−0.4", "0.0". */
export function signedPawns(cp: number): string {
  const size = pawns(cp);
  if (size === '0.0') return size;
  return `${cp > 0 ? '+' : MINUS}${size}`;
}

/** Pawns with one decimal and no sign, rounded the same way either side of zero: "1.6". */
export function pawns(cp: number): string {
  return (Math.round(Math.abs(cp) / 10) / 10).toFixed(1);
}
