import type { Point } from './rewards';

/** Path of the check glyph, shared with the CheckPop component. */
export const CHECK_PATH = 'M5 12.5l4.5 4.5L19 7.5';
export const CROSS_PATH = 'M6.5 6.5l11 11M17.5 6.5l-11 11';

const SVG = 'http://www.w3.org/2000/svg';

function checkGlyph(): SVGSVGElement {
  const svg = document.createElementNS(SVG, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('aria-hidden', 'true');
  const path = document.createElementNS(SVG, 'path');
  path.setAttribute('d', CHECK_PATH);
  svg.append(path);
  return svg;
}

/** A check that pops in over the board at a viewport point and fades away by itself. */
export function popCheckAt(at: Point): void {
  const el = document.createElement('span');
  el.className = 'check-pop';
  el.style.left = `${at.x}px`;
  el.style.top = `${at.y}px`;
  el.append(checkGlyph());
  el.addEventListener('animationend', (e) => e.animationName === 'check-pop-out' && el.remove());
  document.body.append(el);
}
