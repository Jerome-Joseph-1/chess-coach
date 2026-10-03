/** Timings and shapes of the board's small motions. Pure, so they can be tested without a page. */

export interface Timing {
  duration: number;
  delay?: number;
  iterations?: number;
  easing?: string;
}

export interface Speck {
  x: number;
  y: number;
  size: number;
}

const SPECK_TRAVEL = { min: 18, max: 28 };
const SPECK_SIZE = { min: 4, max: 6 };

/** How many king steps apart two squares are. */
export function squareDistance(a: string, b: string): number {
  return Math.max(Math.abs(a.charCodeAt(0) - b.charCodeAt(0)), Math.abs(Number(a[1]) - Number(b[1])));
}

/**
 * When each legal-move mark appears after a piece is picked up: nearest ring first, one stagger step per ring.
 * Long-range pieces get a shorter step, so the farthest ring still starts by `latestMs`.
 */
export function ringDelays(from: string, targets: string[], stepMs: number, latestMs: number): Map<string, number> {
  if (targets.length === 0) return new Map();
  const rings = targets.map((square) => squareDistance(from, square));
  const nearest = Math.min(...rings);
  const spread = Math.max(...rings) - nearest;
  const step = spread > 0 ? Math.min(stepMs, latestMs / spread) : 0;
  return new Map(targets.map((square, i) => [square, Math.round((rings[i] - nearest) * step)]));
}

/** Where each speck of a burst flies, in px from the square's centre: spread round the circle, each angle jittered. */
export function burstSpecks(count: number, random: () => number = Math.random): Speck[] {
  const between = (range: { min: number; max: number }) => range.min + random() * (range.max - range.min);
  return Array.from({ length: count }, (_, i) => {
    const angle = ((i + random()) / count) * 2 * Math.PI;
    const travel = between(SPECK_TRAVEL);
    return { x: Math.cos(angle) * travel, y: Math.sin(angle) * travel, size: between(SPECK_SIZE) };
  });
}

/** The timing that picks an animation up `elapsed` ms after it began; null once it would have ended. */
export function resumeAt<T extends Timing>(timing: T, elapsed: number): T | null {
  const delay = timing.delay ?? 0;
  const end = delay + timing.duration * (timing.iterations ?? 1);
  return elapsed >= end ? null : { ...timing, delay: delay - elapsed };
}

/** A push past the landing square, along the way the piece came, `amount` of a square long. */
export function overshoot(
  from: { column: number; row: number },
  to: { column: number; row: number },
  amount: number,
): { x: number; y: number } {
  const dx = to.column - from.column;
  const dy = to.row - from.row;
  const length = Math.hypot(dx, dy) || 1;
  return { x: (dx / length) * amount, y: (dy / length) * amount };
}
