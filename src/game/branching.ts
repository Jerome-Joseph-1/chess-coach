import type { SetIndex } from '../content/types';

function startsWith(moves: string[], prefix: string[]): boolean {
  return prefix.length <= moves.length && prefix.every((san, i) => moves[i] === san);
}

/** A game in the set that continues with the moves played so far, preferring the current one. */
export function findSibling(set: SetIndex, movesSoFar: string[], currentId: string): string | null {
  const matches = set.games.filter((g) => startsWith(g.moves, movesSoFar));
  const current = matches.find((g) => g.id === currentId);
  return (current ?? matches[0])?.id ?? null;
}
