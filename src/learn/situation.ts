import type { Game, Kind, Turn } from '../content/types';
import { tacticIn } from './tactics';

/** The five answers to "What's going on here?", always offered in this order. */
export const SITUATIONS = [
  { id: 'win', label: 'Win material' },
  { id: 'attack', label: 'Attack the king' },
  { id: 'defend', label: 'Defend' },
  { id: 'trap', label: 'Avoid a trap' },
  { id: 'quiet', label: 'Nothing urgent' },
] as const;

export type Situation = (typeof SITUATIONS)[number]['id'];

/** Every answer that counts as right for this key position; a turn that isn't critical accepts only "Nothing urgent". */
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
