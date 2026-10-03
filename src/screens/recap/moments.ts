import { Chess, type PieceSymbol } from 'chess.js';
import type { MomentResult, StepName, Turn } from '../../content/types';
import { parseUci, withTurn } from '../../game/position';
import { isRight } from '../../progress/moments';
import type { RateCount } from '../../progress/stats';

export type MomentTone = 'right' | 'quiet' | 'missed';

const PIECE_NAMES: Record<PieceSymbol, string> = { p: 'pawn', n: 'knight', b: 'bishop', r: 'rook', q: 'queen', k: 'king' };
const WON_PIECE: Record<PieceSymbol, string> = { p: 'a pawn', n: 'a piece', b: 'a piece', r: 'a rook', q: 'the queen', k: 'the king' };

const FOUND: Record<StepName, string> = {
  spot: 'Spotted it',
  find: 'Spotted it and found the piece',
  solve: 'Spotted it and found the move',
  hold: 'Spotted it and found the move',
};

/** What the first move of a line takes, or null when it takes nothing or the line does not fit the position. */
function capturedBy(fen: string, uci: string | undefined): PieceSymbol | null {
  if (!uci) return null;
  try {
    return new Chess(fen).move(parseUci(uci)).captured ?? null;
  } catch {
    return null;
  }
}

function winPhrase(turn: Turn | undefined): string {
  const captured = turn && capturedBy(turn.fen, turn.lines.best?.[0]);
  if (!turn || !captured) return 'Win material';
  return `Win ${turn.material < 0 ? 'back ' : ''}${WON_PIECE[captured]}`;
}

function defendPhrase(turn: Turn | undefined): string {
  const opponent = turn?.fen.split(' ')[1] === 'w' ? 'b' : 'w';
  // The threat line starts with the opponent's move, so look at it with the opponent to move.
  const captured = turn && capturedBy(withTurn(turn.fen, opponent), turn.lines.threat?.[0]);
  return captured ? `Save your ${PIECE_NAMES[captured]}` : 'Stop the threat';
}

/** The plain name of what a key position is about, e.g. "Win a piece"; `turn` makes it specific. */
export function kindPhrase(m: MomentResult, turn?: Turn): string {
  if (m.type === 'nothing') return 'Nothing special';
  switch (m.kinds[0]) {
    case 'win':
      return winPhrase(turn);
    case 'defend':
      return defendPhrase(turn);
    case 'trap':
      return 'Avoid the trap';
    default:
      return 'Key position';
  }
}

export function momentTitle(m: MomentResult, turn?: Turn): string {
  return `Move ${m.moveNo} · ${kindPhrase(m, turn)}`;
}

export function momentTone(m: MomentResult): MomentTone {
  if (!isRight(m)) return 'missed';
  return m.type === 'nothing' ? 'quiet' : 'right';
}

export function momentSub(m: MomentResult): string {
  const tone = momentTone(m);
  if (tone === 'missed') return 'Missed it';
  if (tone === 'quiet') return 'Right, nothing special';
  if (m.type === 'silent') return 'Found it without a hint';
  return FOUND[m.outcomes.at(-1)?.step ?? 'spot'];
}

/** How many of the game's key positions went right. Quiet positions and silent checks count like any other. */
export function handledWell(moments: MomentResult[]): RateCount {
  return { right: moments.filter(isRight).length, total: moments.length };
}
