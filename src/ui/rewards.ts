export type Celebration = 'step' | 'move' | 'alt' | 'silent' | 'levelup' | 'perfect';

export interface Point {
  x: number;
  y: number;
}

/** Confetti, chime and haptic tick scaled to the moment. */
export function celebrate(_kind: Celebration, _origin?: Point): void {}

/** Soft feedback for a wrong answer. */
export function nudge(_el?: HTMLElement | null): void {}

export function toast(_text: string): void {}
