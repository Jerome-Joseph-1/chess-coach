import confetti from 'canvas-confetti';
import type { Point } from './rewards';

export type ConfettiKind = 'move' | 'silent' | 'levelup' | 'perfect';

interface Burst {
  count: number;
  spread: number;
  velocity: number;
  scalar: number;
  /** Side cannons on top of the central burst: the big one. */
  cannons?: boolean;
}

const BURSTS: Record<ConfettiKind, Burst> = {
  move: { count: 70, spread: 70, velocity: 34, scalar: 0.9 },
  silent: { count: 120, spread: 90, velocity: 42, scalar: 1 },
  levelup: { count: 160, spread: 100, velocity: 48, scalar: 1, cannons: true },
  perfect: { count: 200, spread: 120, velocity: 52, scalar: 1.1, cannons: true },
};

const CANNON_COUNT = 60;

export function particleCount(kind: ConfettiKind): number {
  return BURSTS[kind].count;
}

/** Viewport pixels to confetti's 0-1 coordinates. */
export function toUnit(point: Point, viewport: { width: number; height: number }): Point {
  return { x: point.x / viewport.width, y: point.y / viewport.height };
}

function themeColors(): string[] {
  const style = getComputedStyle(document.documentElement);
  return ['--success', '--warning', '--text-strong'].map((name) => style.getPropertyValue(name).trim()).filter(Boolean);
}

export function burst(kind: ConfettiKind, at?: Point): void {
  const origin = at ? toUnit(at, { width: innerWidth, height: innerHeight }) : { x: 0.5, y: 0.6 };
  const { count, spread, velocity, scalar, cannons } = BURSTS[kind];
  const base = { colors: themeColors(), disableForReducedMotion: true, zIndex: 1000, scalar };
  void confetti({ ...base, particleCount: count, spread, startVelocity: velocity, origin });
  if (!cannons) return;
  const cannon = { ...base, particleCount: CANNON_COUNT, spread: 55, startVelocity: 55 };
  void confetti({ ...cannon, angle: 60, origin: { x: 0, y: 0.75 } });
  void confetti({ ...cannon, angle: 120, origin: { x: 1, y: 0.75 } });
}
