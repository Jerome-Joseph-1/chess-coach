import type { Chess } from 'chess.js';
import type { Game } from '../content/types';

/** How the game stands once its moves run out, told from the user's side. */
export function outcomeText(chess: Chess, game: Game): string {
  if (chess.isCheckmate()) return chess.turn() === game.side ? 'Checkmate. You lost this one.' : 'Checkmate. You won.';
  if (chess.isDraw()) return 'The game ends in a draw.';
  const win = game.turns.at(-1)?.bestWin;
  return win === undefined ? 'That is the end of this game.' : `That is the end of this game. ${standing(win)}`;
}

/** Plain words for a win chance in percent. */
function standing(win: number): string {
  if (win >= 85) return 'You are winning.';
  if (win >= 60) return 'You are better.';
  if (win > 40) return 'The position is about equal.';
  if (win > 15) return 'You are worse.';
  return 'You are losing.';
}
