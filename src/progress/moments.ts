import type { MomentResult } from '../content/types';

/** Every step was answered correctly the first time. */
export function isRight(m: MomentResult): boolean {
  return m.outcomes.every((o) => o.correct);
}

/** The deepest step reached was answered correctly. */
export function holds(m: MomentResult): boolean {
  return m.outcomes.at(-1)?.correct ?? false;
}
