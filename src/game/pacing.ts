/** The first move after Play or Continue waits this long; each move after it is quicker. */
export const RAMP_START_MS = 500;
/** The quickest beat: just longer than a move's slide, so every move is still seen and heard. */
export const RAMP_MIN_MS = 250;
const RAMP_FACTOR = 0.75;
/** The last moves before a stop slow down again: the last one, the one before, and the one before that. */
const APPROACH_MS = [600, 450, 350];

/**
 * How long autoplay waits after a move. `sinceStart` counts the moves already played since Play or
 * Continue; `untilStop` counts the moves left before the next stop, this one included.
 */
export function beat(sinceStart: number, untilStop: number): number {
  const ramp = Math.max(RAMP_MIN_MS, Math.round(RAMP_START_MS * RAMP_FACTOR ** sinceStart));
  const approach = APPROACH_MS[untilStop - 1] ?? 0;
  return Math.max(ramp, approach);
}
