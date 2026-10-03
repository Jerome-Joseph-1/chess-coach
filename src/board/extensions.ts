import { Arrows, type Arrow, type ArrowType } from 'cm-chessboard/src/extensions/arrows/Arrows.js';
import { Markers, type Marker, type MarkerType } from 'cm-chessboard/src/extensions/markers/Markers.js';
import { prefersReducedMotion } from '../ui/motion';
import type { Timing } from './effects';
import { EASE_LEAVE, pinToSquare, removeWhenDone, resume, svgElement } from './svgMotion';

/** How a mark arrives: keyframes for its group, which scales about the square's centre. */
export interface Entrance {
  keyframes: Keyframe[];
  timing: Timing;
}

const ARROW_DRAW = { duration: 220, easing: 'cubic-bezier(0.2, 0, 0, 1)' };
const ARROW_HEAD = { duration: 90, delay: 150, easing: 'ease-out' };
const ARROW_LEAVE = { duration: 150, easing: EASE_LEAVE };

/**
 * cm-chessboard redraws every marker whenever one changes and on every resize. These markers remember when
 * each one first showed, so a redraw carries its entrance on instead of playing it again.
 */
export class BoardMarkers extends Markers {
  /** Set by the board: which marks move as they arrive, and how. */
  entrance: (type: MarkerType, square: string) => Entrance | null = () => null;
  private shownSince = new WeakMap<Marker, number>();

  protected override drawMarker(marker: Marker): SVGGElement {
    const group = super.drawMarker(marker);
    const entrance = this.entrance(marker.type, marker.square);
    if (!entrance) return group;
    const since = this.shownSince.get(marker) ?? performance.now();
    this.shownSince.set(marker, since);
    pinToSquare(group, this.chessboard.view.squareWidth);
    resume(group, entrance.keyframes, entrance.timing, since);
    return group;
  }
}

export interface BoardArrowsProps {
  sprite: string;
  /** Arrows of these types draw themselves in and fade out; the rest come and go at once. */
  drawIn?: ArrowType[];
}

const keyOf = (arrow: Pick<Arrow, 'from' | 'to' | 'type'>) => `${arrow.type.class} ${arrow.from}${arrow.to}`;

/**
 * Arrows that draw themselves from tail to tip and fade out when removed. An arrow removed and added again
 * in the same task (a redraw of the same lines) stays as it is.
 */
export class BoardArrows extends Arrows {
  private animated: Set<ArrowType>;
  private shownSince = new Map<string, number>();
  /** Copies of removed arrows, fading out; kept apart because every change empties the arrow group. */
  private leavingGroup: SVGGElement;
  private leaving = new Map<string, SVGGElement>();
  private tidyQueued = false;

  constructor(chessboard: unknown, props: BoardArrowsProps) {
    super(chessboard, props);
    this.animated = new Set(props.drawIn);
    this.leavingGroup = svgElement('g', { class: 'arrows-leaving' });
    this.arrowGroup.before(this.leavingGroup);
  }

  override onRedrawBoard(): void {
    super.onRedrawBoard();
    this.queueTidy();
  }

  override removeArrows(type?: ArrowType, from?: string, to?: string): void {
    const fading = prefersReducedMotion() ? [] : this.arrows.filter((a) => this.animated.has(a.type) && a.matches(from, to, type));
    const copies = fading.map((arrow) => [keyOf(arrow), this.copyOf(arrow)] as const);
    super.removeArrows(type, from, to);
    for (const [key, copy] of copies) {
      if (!copy) continue;
      this.leaving.get(key)?.remove();
      this.leaving.set(key, copy);
      this.leavingGroup.append(copy);
    }
  }

  protected override drawArrow(arrow: Arrow): void {
    super.drawArrow(arrow);
    if (!this.animated.has(arrow.type)) return;
    const key = keyOf(arrow);
    const since = this.shownSince.get(key) ?? performance.now();
    this.shownSince.set(key, since);
    const group = this.arrowGroup.lastElementChild;
    if (group) drawArrowIn(group, since);
  }

  private queueTidy(): void {
    if (this.tidyQueued) return;
    this.tidyQueued = true;
    queueMicrotask(() => {
      this.tidyQueued = false;
      this.tidy();
    });
  }

  /** Once the task that changed the arrows is over: forget gone arrows and fade out the copies of the ones not put back. */
  private tidy(): void {
    const shown = new Set(this.arrows.filter((a) => this.animated.has(a.type)).map(keyOf));
    for (const key of this.shownSince.keys()) if (!shown.has(key)) this.shownSince.delete(key);
    for (const [key, copy] of this.leaving) {
      if (shown.has(key)) copy.remove();
      else fadeOut(copy);
    }
    this.leaving.clear();
  }

  /** A still copy of an arrow as drawn, under a class the arrow selectors do not match. */
  private copyOf(arrow: Arrow): SVGGElement | null {
    const drawn = [...this.arrowGroup.children].find((g) => g.getAttribute('data-arrow') === arrow.from + arrow.to && g.classList.contains(arrow.type.class));
    if (!(drawn instanceof SVGGElement)) return null;
    const copy = drawn.cloneNode(true) as SVGGElement;
    copy.setAttribute('class', 'arrow arrow-leaving');
    copy.style.setProperty('--arrow', getComputedStyle(drawn).getPropertyValue('--arrow'));
    // Its own id, so the line keeps pointing at its own head while the real arrow is drawn again.
    const head = copy.querySelector('marker');
    const line = copy.querySelector('line');
    if (head && line) {
      head.id = `${head.id}-leaving`;
      line.setAttribute('marker-end', `url(#${head.id})`);
    }
    return copy;
  }
}

/** The shaft grows from tail to tip, then the head fades in. */
function drawArrowIn(group: Element, since: number): void {
  const line = group.querySelector('line');
  const head = group.querySelector('marker use');
  if (!line) return;
  const length = Math.hypot(
    line.x2.baseVal.value - line.x1.baseVal.value,
    line.y2.baseVal.value - line.y1.baseVal.value,
  );
  const dash = `${length} ${length}`;
  resume(line, [{ strokeDasharray: dash, strokeDashoffset: length }, { strokeDasharray: dash, strokeDashoffset: 0 }], ARROW_DRAW, since);
  if (head) resume(head, [{ opacity: 0 }, { opacity: 1 }], ARROW_HEAD, since);
}

function fadeOut(copy: SVGGElement): void {
  removeWhenDone(copy.animate({ opacity: 0 }, { ...ARROW_LEAVE, fill: 'forwards' }), copy);
}
