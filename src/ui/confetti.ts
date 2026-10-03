import confetti from 'canvas-confetti';
import type { Celebration, Point } from './rewards';

interface Burst {
  count: number;
  spread: number;
  velocity: number;
  scalar: number;
}

const BURSTS: Record<Celebration, Burst> = {
  step: { count: 12, spread: 40, velocity: 20, scalar: 0.7 },
  alt: { count: 20, spread: 50, velocity: 26, scalar: 0.8 },
  move: { count: 40, spread: 60, velocity: 32, scalar: 0.9 },
  silent: { count: 120, spread: 90, velocity: 42, scalar: 1 },
  levelup: { count: 160, spread: 100, velocity: 48, scalar: 1 },
  perfect: { count: 200, spread: 120, velocity: 52, scalar: 1.1 },
};

const CANNON_COUNT = 60;

export function particleCount(kind: Celebration): number {
  return BURSTS[kind].count;
}

/** Viewport pixels to confetti's 0-1 coordinates. */
export function toUnit(point: Point, viewport: { width: number; height: number }): Point {
  return { x: point.x / viewport.width, y: point.y / viewport.height };
}

function themeColors(): string[] {
  const style = getComputedStyle(document.documentElement);
  return ['--good', '--star', '--accent'].map((name) => style.getPropertyValue(name).trim()).filter(Boolean);
}

export function burst(kind: Celebration, at?: Point): void {
  const origin = at ? toUnit(at, { width: innerWidth, height: innerHeight }) : { x: 0.5, y: 0.6 };
  const { count, spread, velocity, scalar } = BURSTS[kind];
  const base = { colors: themeColors(), disableForReducedMotion: true, zIndex: 1000, scalar };
  void confetti({ ...base, particleCount: count, spread, startVelocity: velocity, origin });
  if (kind !== 'levelup') return;
  const cannon = { ...base, particleCount: CANNON_COUNT, spread: 55, startVelocity: 55 };
  void confetti({ ...cannon, angle: 60, origin: { x: 0, y: 0.75 } });
  void confetti({ ...cannon, angle: 120, origin: { x: 1, y: 0.75 } });
}
