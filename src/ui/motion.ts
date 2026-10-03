/** Shared motion helpers; durations and curves live in tokens.css so CSS and script agree. */

export const PRESS_MS = 80;
export const QUICK_MS = 160;
export const BASE_MS = 240;
export const SLOW_MS = 360;
const STAGGER_MS = 50;
const STAGGER_MAX = 8;
/** The spring in tokens.css, for animations started from script. */
export const SPRING =
  'linear(0, 0.0848 2.6%, 0.2954 6%, 0.5235 10%, 0.7088 14.2%, 0.8434 18.6%, 0.9314 23.4%, 0.9785 28.6%, 0.9972 35%, 1.0016 43%, 1)';

export function prefersReducedMotion(): boolean {
  return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/** Delay for the item at `index` in a staggered group; long lists stop growing so the last item never waits long. */
export function staggerDelay(index: number, step = STAGGER_MS): number {
  return Math.min(index, STAGGER_MAX) * step;
}

/** The value a count-up shows at progress `t` (0..1), easing out so it slows as it lands. */
export function countValue(from: number, to: number, t: number): number {
  const clamped = Math.min(1, Math.max(0, t));
  const eased = 1 - (1 - clamped) ** 3;
  return Math.round(from + (to - from) * eased);
}

/** Counts from `from` to `to`, calling `show` each frame; returns a function that stops it. */
export function countUp(from: number, to: number, durationMs: number, show: (n: number) => void): () => void {
  if (prefersReducedMotion() || durationMs <= 0 || from === to) {
    show(to);
    return () => {};
  }
  const start = performance.now();
  let frame = requestAnimationFrame(function step(now) {
    const t = (now - start) / durationMs;
    show(countValue(from, to, t));
    if (t < 1) frame = requestAnimationFrame(step);
  });
  return () => cancelAnimationFrame(frame);
}

/** Runs `change`, then animates the element from its old height to its new one instead of jumping. */
export function animateHeight(el: HTMLElement, change: () => void, durationMs = SLOW_MS): void {
  const before = el.getBoundingClientRect().height;
  change();
  const after = el.getBoundingClientRect().height;
  if (before === after || prefersReducedMotion() || typeof el.animate !== 'function') return;
  el.animate([{ height: `${before}px` }, { height: `${after}px` }], { duration: durationMs, easing: SPRING });
}

/** A short horizontal shake for a wrong answer; nothing under reduced motion. */
export function shake(el: Element | null | undefined): void {
  if (!el || prefersReducedMotion() || typeof el.animate !== 'function') return;
  el.animate(
    [{ transform: 'none' }, { transform: 'translateX(-4px)' }, { transform: 'translateX(4px)' }, { transform: 'translateX(-2px)' }, { transform: 'none' }],
    { duration: BASE_MS, easing: 'ease-out' },
  );
}
