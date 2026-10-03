import type { Game } from '../content/types';

/** The five answers to "What's going on here?", always offered in this order. */
export const SITUATIONS = [
  { id: 'win', label: 'Win material' },
  { id: 'attack', label: 'Attack the king' },
  { id: 'defend', label: 'Defend' },
  { id: 'trap', label: 'Avoid a trap' },
  { id: 'quiet', label: 'Nothing urgent' },
] as const;

export type Situation = (typeof SITUATIONS)[number]['id'];

/** Every answer that counts as right for this key position; a quiet turn accepts only "Nothing urgent". */
export function situationsOf(game: Game, turnIndex: number): Situation[] {
  const turn = game.turns[turnIndex];
  if (turn.label !== 'critical') return ['quiet'];
  const answers = turn.kinds.map((kind): Situation => (kind === 'win' ? 'win' : kind));
  return answers.length > 0 ? [...new Set(answers)] : ['win'];
}
