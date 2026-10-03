import { prefersReducedMotion } from '../ui/motion';
import { resumeAt, type Timing } from './effects';

const SVG_NS = 'http://www.w3.org/2000/svg';
/** --ease-leave: things on their way out speed up. */
export const EASE_LEAVE = 'cubic-bezier(0.4, 0, 1, 1)';

/** Starts an animation as if it began at `since`, so an element cm-chessboard redrew carries on instead of starting over. */
export function resume(el: Element, keyframes: Keyframe[], timing: Timing, since: number): void {
  if (prefersReducedMotion()) return;
  const at = resumeAt(timing, performance.now() - since);
  if (at) el.animate(keyframes, { ...at, fill: 'backwards' });
}

/**
 * Scaling an SVG element turns it about the board's corner, and a fill-box origin ignores the translate that places it;
 * this puts the origin on the centre of the square the element is translated to.
 */
export function pinToSquare(el: SVGGraphicsElement, squareSize: number): void {
  const list = el.transform.baseVal;
  const { e, f } = list.numberOfItems > 0 ? list.getItem(0).matrix : { e: 0, f: 0 };
  el.style.transformOrigin = `${e + squareSize / 2}px ${f + squareSize / 2}px`;
}

export function svgElement<K extends keyof SVGElementTagNameMap>(
  name: K,
  attributes: Record<string, string | number> = {},
): SVGElementTagNameMap[K] {
  const el = document.createElementNS(SVG_NS, name);
  for (const [key, value] of Object.entries(attributes)) el.setAttribute(key, String(value));
  return el;
}

/** Removes a short-lived element once its animation is over, or cut short. */
export function removeWhenDone(animation: Animation, el: Element): void {
  animation.onfinish = () => el.remove();
  animation.oncancel = () => el.remove();
}
