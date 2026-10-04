import { captionFor } from '../board/captions';
import type { ArrowTone } from '../board/types';
import type { Game, Turn } from '../content/types';
import { mistakeVerdict } from './copy';
import { stepsOf, type Sequence, type SequenceStep } from './sequence';

/** The user's losing move and the answer that shows what goes wrong, with captions that say so. */
function mistakeSteps(game: Game, turn: Turn, uci: string | null): SequenceStep[] {
  const answer = uci ? turn.refutations[uci] : undefined;
  if (!uci || !answer?.length) return [];
  const steps = stepsOf(turn.fen, [uci, ...answer], 'mistake');
  const { at, text } = mistakeVerdict(game, turn.fen, steps);
  return steps.slice(0, at + 1).map((step, i) => {
    if (i === at) return { ...step, note: text };
    return i === 0 ? { ...step, note: 'Your move' } : step;
  });
}

/** The turn's best line, or `fallback` when it has none, as a plan turn that was not critical. */
function bestLine(turn: Turn, fallback: string[] = []): string[] {
  return turn.lines.best?.length ? turn.lines.best : fallback;
}

/** The best line from the pause position; after a mistake its first move says it is the better one. */
function bestSteps(game: Game, turn: Turn, afterMistake: boolean, fallback?: string[]): SequenceStep[] {
  const steps = stepsOf(turn.fen, bestLine(turn, fallback), 'best');
  const [first] = steps;
  if (!afterMistake || !first) return steps;
  const text = captionFor(first.before, first.uci, game.side);
  return [{ ...first, note: text ? `The better move: ${text}` : 'The better move' }, ...steps.slice(1)];
}

/**
 * What the reveal plays for one turn: the user's losing move and its answer, if they played one,
 * then the best line from the pause position, or `fallback` (uci) when the turn has none.
 */
export function revealSequence(game: Game, turnIndex: number, missedUci: string | null, fallback?: string[]): Sequence {
  const turn = game.turns[turnIndex];
  const mistake = mistakeSteps(game, turn, missedUci);
  return { steps: [...mistake, ...bestSteps(game, turn, mistake.length > 0, fallback)] };
}

/** A single line from a position, e.g. a refutation to look at on its own. */
export function lineSequence(fen: string, moves: string[], tone: ArrowTone): Sequence {
  return { steps: stepsOf(fen, moves, tone) };
}
