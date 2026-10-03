import { burst } from './confetti';
import { popCheckAt } from './checkPop';
import { haptic } from './haptics';
import { playSound, type SoundKind } from './sound';
import { toast } from './toast';

/** The only moments that get confetti: a silent check found, a perfect game, a new level. */
export type Milestone = 'silent' | 'perfect' | 'levelup';

export interface Point {
  x: number;
  y: number;
}

export { toast };

const SOUND_FOR: Record<Milestone, SoundKind> = {
  silent: 'silent',
  levelup: 'levelup',
  perfect: 'levelup',
};

export function prefersReducedMotion(): boolean {
  return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/** Confetti, chime and haptic tick. Reserved for milestones; everything else uses `confirm`. */
export function celebrate(kind: Milestone, origin?: Point): void {
  burst(kind, origin);
  playSound(SOUND_FOR[kind]);
  haptic(kind);
}

/** Quiet feedback for a right answer or move: a soft chime, a tick, and a check that pops at `at`. */
export function confirm(kind: 'step' | 'move', at?: Point): void {
  if (at) popCheckAt(at);
  playSound(kind);
  haptic(kind);
}

const SHAKE = [0, -6, 6, -4, 0].map((x) => ({ translate: `${x}px 0` }));

/** Soft feedback for a wrong answer: a short shake and a low tone. No red screens. */
export function nudge(el?: HTMLElement | null): void {
  if (el && !prefersReducedMotion()) el.animate(SHAKE, { duration: 200, easing: 'ease-out' });
  playSound('wrong');
  haptic('wrong');
}
