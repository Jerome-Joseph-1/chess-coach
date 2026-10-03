import { burst, type ConfettiKind } from './confetti';
import { haptic, type HapticKind } from './haptics';
import { playSound, type SoundKind } from './sound';
import { toast } from './toast';

/**
 * What a right answer earns. Confetti is kept for the right move at step 3 and beyond,
 * a silent check found, a perfect game and a new level.
 */
export type Celebration = 'step' | 'move' | 'alt' | 'silent' | 'levelup' | 'perfect';

export interface Point {
  x: number;
  y: number;
}

export { toast };

interface Reward {
  sound: SoundKind;
  haptic: HapticKind;
  confetti: ConfettiKind | null;
}

const REWARDS: Record<Celebration, Reward> = {
  step: { sound: 'step', haptic: 'step', confetti: null },
  alt: { sound: 'step', haptic: 'step', confetti: null },
  move: { sound: 'move', haptic: 'move', confetti: 'move' },
  silent: { sound: 'silent', haptic: 'silent', confetti: 'silent' },
  levelup: { sound: 'levelup', haptic: 'levelup', confetti: 'levelup' },
  perfect: { sound: 'levelup', haptic: 'perfect', confetti: 'perfect' },
};

export function prefersReducedMotion(): boolean {
  return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export function rewardFor(kind: Celebration): Reward {
  return REWARDS[kind];
}

/** Chime and tick for every right answer; confetti from `origin` only where the kind earns it. */
export function celebrate(kind: Celebration, origin?: Point): void {
  const reward = REWARDS[kind];
  if (reward.confetti) burst(reward.confetti, origin);
  playSound(reward.sound);
  haptic(reward.haptic);
}

const SHAKE = [0, -6, 6, -4, 0].map((x) => ({ translate: `${x}px 0` }));

/** Soft feedback for a wrong answer: a short shake and a low tone. No red screens. */
export function nudge(el?: HTMLElement | null): void {
  if (el && !prefersReducedMotion()) el.animate(SHAKE, { duration: 200, easing: 'ease-out' });
  playSound('wrong');
  haptic('wrong');
}
