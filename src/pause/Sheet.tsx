import type { ComponentChildren, RefObject } from 'preact';
import { useLayoutEffect, useRef } from 'preact/hooks';
import { animateHeight, BASE_MS, prefersReducedMotion } from '../ui/motion';
import { Dock } from './Dock';
import './pause.css';

export interface SheetProps {
  label: string;
  /** The coach's panel: content-sized, it scrolls inside the room between the board and the dock. */
  innerRef: RefObject<HTMLDivElement>;
  children: ComponentChildren;
  /** The dock's row; it stays at the bottom while the panel scrolls. */
  footer?: ComponentChildren;
  /** A new stage grows or shrinks the panel smoothly to its new height. */
  stage?: string;
}

/** Keeps the panel's last height, so a change of stage can grow from it instead of jumping. */
function useGrowOnStage(ref: RefObject<HTMLElement>, stage: string | undefined) {
  const last = useRef<{ stage?: string; height: number } | null>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const before = last.current;
    if (before && before.stage !== stage) {
      el.style.height = `${before.height}px`;
      animateHeight(el, () => (el.style.height = ''));
    }
    last.current = { stage, height: el.getBoundingClientRect().height };
  });
}

/** Glides the panel so `el` is in view, e.g. a hint ladder or a takeaway that arrived under the fold. */
export function scrollIntoPanel(el: HTMLElement | null): void {
  const panel = el?.closest<HTMLElement>('.coach-scroll');
  if (!el || !panel) return;
  const below = el.getBoundingClientRect().bottom - panel.getBoundingClientRect().bottom;
  if (below > 0) panel.scrollBy({ top: below + 12, behavior: prefersReducedMotion() ? 'auto' : 'smooth' });
}

/** --ease-leave in tokens.css: things leaving speed up. */
const EASE_LEAVE = 'cubic-bezier(0.4, 0, 1, 1)';

/** The panel slides down into the dock, then `done` runs; a short fade under reduced motion. */
export function leavePanel(el: HTMLElement | null, done: () => void): void {
  if (!el || typeof el.animate !== 'function') return done();
  const still = prefersReducedMotion();
  const frames = still ? [{ opacity: 1 }, { opacity: 0 }] : [{ transform: 'none', opacity: 1 }, { transform: 'translateY(32px)', opacity: 0 }];
  const motion = el.animate(frames, { duration: still ? BASE_MS / 2 : BASE_MS, easing: EASE_LEAVE, fill: 'forwards' });
  motion.onfinish = done;
}

/** The coach's panel under the board, in the flow so it can never cover the board, over the dock. */
export function Sheet({ label, innerRef, children, footer, stage }: SheetProps) {
  useGrowOnStage(innerRef, stage);
  return (
    <div class="pause-sheet" role="region" aria-label={label}>
      <div class="coach-scroll">
        <div class="coach-panel" ref={innerRef}>
          {children}
        </div>
      </div>
      {footer && <Dock label={label}>{footer}</Dock>}
    </div>
  );
}
