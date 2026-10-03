import { captionFor } from '../board/captions';
import type { ArrowTone } from '../board/types';
import type { Side } from '../content/types';
import { playLine, type PlayedMove } from './position';

export interface SequenceStep extends PlayedMove {
  /** Colour of the arrow that leads the move. */
  tone: ArrowTone;
  /** Says what happens at this move in place of the usual description, e.g. what goes wrong in a mistake. */
  note?: string;
}

/**
 * Moves the reveal plays one after another. A step may start from another position than the one
 * before it ended on: a mistake line is followed by the best line from the pause position.
 */
export interface Sequence {
  steps: SequenceStep[];
}

export function stepsOf(fen: string, moves: string[], tone: ArrowTone): SequenceStep[] {
  return playLine(fen, moves).map((move) => ({ ...move, tone }));
}

/** The position after `at` steps; at 0, the position the first step starts from. */
export function fenAt(sequence: Sequence, at: number): string {
  return at === 0 ? sequence.steps[0].before : sequence.steps[at - 1].after;
}

/** "8. bxa5" for a White move, "8… bxa5" for a Black one, numbered from the position before it. */
export function numberedSan(fenBefore: string, san: string): string {
  const [, turn, , , , number] = fenBefore.split(' ');
  return `${Number(number) || 1}${turn === 'b' ? '…' : '.'} ${san}`;
}

/** "8. bxa5 — you take the knight": the move, then what it does when there is something to say. */
export function captionOf(step: SequenceStep, userSide: Side): string {
  const move = numberedSan(step.before, step.san);
  const text = step.note ?? captionFor(step.before, step.uci, userSide);
  return text ? `${move} — ${text}` : move;
}

/** Same moves from the same position are the same sequence, whatever object carries them. */
export function sequenceKey(sequence: Sequence): string {
  return `${sequence.steps[0]?.before} ${sequence.steps.map((step) => step.uci).join(' ')}`;
}
