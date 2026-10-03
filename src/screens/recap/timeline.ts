import { BASE_MS, staggerDelay } from '../../ui/motion';

/** When each part of Game complete arrives, so the count, the pips, the ticks and the rows stay in step. */
export const PIP_START_MS = 240;
export const PIP_GAP_MS = 80;
// The summary and the coach's note take the first two places in the stagger.
const ROWS_AFTER = 2;

export function pipDelay(index: number): number {
  return PIP_START_MS + index * PIP_GAP_MS;
}

/** The score lands as the last pip fills. */
export function scoreDuration(pips: number): number {
  return Math.max(0, pips - 1) * PIP_GAP_MS + BASE_MS;
}

export function rowDelay(index: number): number {
  return staggerDelay(index + ROWS_AFTER);
}

/** Next game comes last: after the final row and the final pip. */
export function dockDelay(rows: number, pips: number): number {
  return Math.max(rowDelay(rows), pipDelay(pips)) + PIP_GAP_MS;
}
