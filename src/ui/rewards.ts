import { burst } from './confetti';
import { haptic } from './haptics';
import { playSound, type SoundKind } from './sound';
import { toast } from './toast';

export type Celebration = 'step' | 'move' | 'alt' | 'silent' | 'levelup' | 'perfect';

export interface Point {
  x: number;
  y: number;
}

export { toast };

const SOUND_FOR: Record<Celebration, SoundKind> = {
  step: 'step',
  alt: 'step',
  move: 'move',
  silent: 'silent',
  levelup: 'levelup',
  perfect: 'levelup',
};

export function prefersReducedMotion(): boolean {
  return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/** Confetti, chime and haptic tick scaled to the moment. */
export function celebrate(kind: Celebration, origin?: Point): void {
  burst(kind, origin);
  playSound(SOUND_FOR[kind]);
  haptic(kind);
}

const SHAKE = [0, -6, 6, -4, 0].map((x) => ({ translate: `${x}px 0` }));

/** Soft feedback for a wrong answer: a short shake and a low thud. No red screens. */
export function nudge(el?: HTMLElement | null): void {
  if (el && !prefersReducedMotion()) el.animate(SHAKE, { duration: 200, easing: 'ease-out' });
  playSound('wrong');
  haptic('wrong');
}
