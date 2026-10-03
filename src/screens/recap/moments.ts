import { Chess, type PieceSymbol } from 'chess.js';
import type { MomentResult, StepName, Turn } from '../../content/types';
import { parseUci, withTurn } from '../../game/position';
import { isRight } from '../../progress/moments';
import type { RateCount } from '../../progress/stats';

export type MomentTone = 'right' | 'quiet' | 'hinted' | 'missed';

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

/** "Move 7 · Trapped piece": the pattern when the game file named one, else the kind in plain words. */
export function momentTitle(m: MomentResult, turn?: Turn, pattern?: string): string {
  if (m.type === 'nothing') return `Move ${m.moveNo} · Nothing here`;
  return `Move ${m.moveNo} · ${pattern ?? kindPhrase(m, turn)}`;
}

export function momentTone(m: MomentResult): MomentTone {
  if (!isRight(m)) return m.hinted ? 'hinted' : 'missed';
  return m.type === 'nothing' ? 'quiet' : 'right';
}

export function momentSub(m: MomentResult): string {
  const tone = momentTone(m);
  if (tone === 'missed') return 'Missed it · saved for review';
  if (tone === 'hinted') return 'With a hint · saved for review';
  if (tone === 'quiet') return 'Right, it was quiet';
  if (m.type === 'silent') return 'Found it without a hint';
  return FOUND[m.outcomes.at(-1)?.step ?? 'spot'];
}

/** How many of the game's key positions went right. Quiet positions and silent checks count like any other. */
export function handledWell(moments: MomentResult[]): RateCount {
  return { right: moments.filter(isRight).length, total: moments.length };
}

function moveList(moves: number[]): string {
  if (moves.length === 1) return `move ${moves[0]}`;
  return `moves ${moves.slice(0, -1).join(', ')} and ${moves.at(-1)}`;
}

/** The coach's one-line take on the game: how it went and which moves to look at again. */
export function coachNote(moments: MomentResult[]): string | null {
  if (moments.length === 0) return null;
  const missed = moments.filter((m) => !isRight(m)).map((m) => m.moveNo);
  if (missed.length === 0) return 'Clean game: every key position handled well.';
  const again = `Worth another look: ${moveList(missed)}.`;
  return missed.length === moments.length ? `A tough one. ${again}` : `Good game. ${again}`;
}
