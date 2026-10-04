import { Chess, type Square } from 'chess.js';
import { NAME } from '../board/captions';
import { illegalReason, type IllegalReason } from '../board/moves';
import type { Side } from '../content/types';

const WHY: Record<IllegalReason, string> = {
  check: 'your king is in check',
  pinned: 'that would leave your king in check',
  'into-check': 'it would be in check there',
  blocked: '',
};

/** Said when a pawn is sent sideways, or diagonally with nothing to take. */
const PAWN_RULE = 'a pawn moves straight ahead and only takes diagonally';

/** A piece that can't move at all, said plainly. */
function stuck(who: string, type: string): string {
  if (type === 'p') return `${who} is blocked.`;
  return type === 'k' ? `${who} can't move.` : `${who} can't move: your own pieces are in the way.`;
}

/**
 * What the coach says when a move breaks the rules, e.g. "Your pawn on c3 can't go to d3."
 * `to` is null when the piece was picked up but has no move at all.
 */
export function illegalLine(fen: string, side: Side, from: string, to: string | null): string {
  const type = new Chess(fen).get(from as Square)?.type ?? 'p';
  const who = `Your ${NAME[type]} on ${from}`;
  const why = WHY[illegalReason(fen, side, from, to)];
  if (!why && !to) return stuck(who, type);
  const what = to ? `${who} can't go to ${to}` : `${who} can't move`;
  const rule = !why && type === 'p' && to && to[0] !== from[0] ? PAWN_RULE : why;
  return rule ? `${what}: ${rule}.` : `${what}.`;
}
