import type { Game, Turn } from '../content/types';
import type { LineOption } from './LineStepper';
import { opponentName } from './copy';
import { flipTurn } from './position';

/** Lines the reveal can step through for one turn, in tab order; only the ones the content has. */
export function revealLines(
  game: Game,
  turnIndex: number,
  playedUci: string | null = null,
  playedId: 'yours' | 'refutation' = 'yours',
): LineOption[] {
  const turn = game.turns[turnIndex];
  const { threat, best, mistake } = turn.lines;
  const answer = playedUci ? turn.refutations[playedUci] : undefined;
  const lines: LineOption[] = [];
  if (best?.length) lines.push({ id: 'best', label: 'Best line', fen: turn.fen, moves: best });
  if (playedUci && answer?.length) {
    lines.push({ id: playedId, label: 'Your move', fen: turn.fen, moves: [playedUci, ...answer] });
  }
  const repeatsYours = mistake?.[0] === playedUci && answer?.length;
  if (mistake?.length && !repeatsYours) {
    lines.push({ id: 'mistake', label: 'Common mistake', fen: turn.fen, moves: mistake });
  }
  if (threat?.length) {
    lines.push({ id: 'threat', label: `${opponentName(game)}'s threat`, fen: flipTurn(turn.fen), moves: threat });
  }
  return lines;
}

/** The line that backs the headline: what you win, the threat you stop, or the trap. */
export function openingLine(turn: Turn): LineOption['id'] {
  if (turn.kinds.includes('win')) return 'best';
  if (turn.kinds.includes('defend')) return 'threat';
  if (turn.kinds.includes('trap')) return 'mistake';
  return 'best';
}
