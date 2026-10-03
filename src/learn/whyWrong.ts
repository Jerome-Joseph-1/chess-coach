import type { Square } from 'chess.js';
import type { Game } from '../content/types';
import type { HintLevel } from '../pause/flow';
import type { TacticId } from './tactics';

/**
 * blunder: the stored punishing line wins material or mates.
 * bait: the move is the position's common mistake.
 * ignores-threat: a defend position, and the punishing line is the opponent's threat.
 * weaker: loses under 10% and costs nothing.
 * missed: loses 10% or more but no material: the chance just goes.
 * unknown: the move has no grade.
 */
export type WrongKind = 'blunder' | 'bait' | 'ignores-threat' | 'weaker' | 'missed' | 'unknown';

export interface WrongMove {
  kind: WrongKind;
  /** One or two plain sentences for the coach. Never names the best move or the game's move. */
  text: string;
  /** The opponent's punishing reply to show on the board (uci), or null to show nothing. */
  reply: string | null;
  /** Squares of what the reply wins or threatens, marked on the board. */
  targets: Square[];
  pattern?: TacticId;
}

const FALLBACK = 'Not quite. Try again.';

/** Why `uci` is wrong at this key position, told only as far as the hints already given allow. */
export function whyWrong(_game: Game, _turnIndex: number, _uci: string, _hint: HintLevel): WrongMove {
  return { kind: 'unknown', text: FALLBACK, reply: null, targets: [] };
}
