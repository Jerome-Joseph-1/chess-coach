import type { Turn } from '../content/types';

export type Verdict = 'best' | 'good' | 'inaccuracy' | 'mistake' | 'unknown';

export interface Grade {
  verdict: Verdict;
  /** Win% lost against the best move; absent when the move was not analysed. */
  loss?: number;
}

const BEST_MAX = 0.5;
const GOOD_MAX = 2.5;
const MISTAKE_MIN = 10;

export function gradeMove(turn: Turn, uci: string): Grade {
  const loss = turn.grades[uci];
  if (loss === undefined) return { verdict: 'unknown' };
  if (loss <= BEST_MAX) return { verdict: 'best', loss };
  if (loss <= GOOD_MAX) return { verdict: 'good', loss };
  if (loss < MISTAKE_MIN) return { verdict: 'inaccuracy', loss };
  return { verdict: 'mistake', loss };
}

export function isHolding(turn: Turn, uci: string): boolean {
  const { verdict } = gradeMove(turn, uci);
  return verdict === 'best' || verdict === 'good';
}

/** Share of players at this level who pick a move that holds. */
export function holdShare(turn: Turn): number {
  return turn.human.reduce((sum, m) => (isHolding(turn, m.uci) ? sum + m.share : sum), 0);
}
