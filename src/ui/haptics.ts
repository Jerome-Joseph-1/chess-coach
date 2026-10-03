import { getSettings } from '../progress/store';

export type HapticKind = 'step' | 'move' | 'silent' | 'levelup' | 'perfect' | 'wrong';

const PATTERNS: Record<HapticKind, number[]> = {
  step: [8],
  move: [10, 40, 10],
  silent: [12, 40, 12, 40, 12],
  levelup: [20, 40, 20, 40, 60],
  perfect: [20, 40, 20, 40, 60],
  wrong: [28],
};

export function patternFor(kind: HapticKind): number[] {
  return PATTERNS[kind];
}

/** No-op where vibration is missing (iOS Safari) or switched off in settings. */
export function haptic(kind: HapticKind): void {
  if (typeof navigator === 'undefined' || !navigator.vibrate || !getSettings().haptics) return;
  navigator.vibrate(PATTERNS[kind]);
}
