import type { Game, Kind, Turn } from '../content/types';
import { tacticIn } from './tactics';

/** The five answers to "What's going on here?", always offered in this order. */
export const SITUATIONS = [
  { id: 'win', label: 'Win material' },
  { id: 'attack', label: 'Attack the king' },
  { id: 'defend', label: 'Defend' },
  { id: 'trap', label: 'Avoid a trap' },
  { id: 'quiet', label: 'Improve a piece' },
] as const;

export type Situation = (typeof SITUATIONS)[number]['id'];

/** When a position has several right answers, the most urgent comes first. */
const URGENCY: Situation[] = ['defend', 'attack', 'win', 'trap', 'quiet'];

/** The right answer the coach speaks to when there are several. */
export function mainSituation(answers: Situation[]): Situation {
  return URGENCY.find((situation) => answers.includes(situation)) ?? 'quiet';
}

/** Every answer that counts as right for this key position; a turn that isn't critical accepts only "Improve a piece". */
export function situationsOf(game: Game, turnIndex: number): Situation[] {
  const turn = game.turns[turnIndex];
  if (turn.label !== 'critical') return ['quiet'];
  const answers = turn.kinds.flatMap((kind) => answersFor(kind, turn, game.side));
  return answers.length > 0 ? [...new Set(answers)] : ['win'];
}

/** A win that mates is an attack on the king; one that threatens mate on the way to material is both. */
function answersFor(kind: Kind, turn: Turn, side: Game['side']): Situation[] {
  if (kind !== 'win') return [kind];
  const tactic = tacticIn(turn.fen, turn.lines.best ?? [], side);
  if (tactic?.id === 'checkmate') return ['attack'];
  return tactic?.id === 'mate-threat' ? ['attack', 'win'] : ['win'];
}
