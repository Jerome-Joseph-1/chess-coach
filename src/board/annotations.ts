import type { Arrows, ArrowType } from 'cm-chessboard/src/extensions/arrows/Arrows.js';
import type { Markers, MarkerType } from 'cm-chessboard/src/extensions/markers/Markers.js';
import { colorFor, drawingBetween, toggleDrawing, type DrawColor, type Drawing } from './drawings';
import { squareAtPoint } from './geometry';

const COLORS: DrawColor[] = ['green', 'red', 'blue', 'orange'];

function byColor<T>(make: (color: DrawColor) => T): Record<DrawColor, T> {
  return Object.fromEntries(COLORS.map((color) => [color, make(color)])) as Record<DrawColor, T>;
}

const ARROWS = byColor<ArrowType>((color) => ({ class: `arrow-draw-${color}` }));
const CIRCLES = byColor<MarkerType>((color) => ({ class: `marker-draw-${color}`, slice: 'markerCircle' }));

interface Start {
  square: string;
  color: DrawColor;
}

/**
 * The player's own arrows and circles, drawn with the right mouse button like on Chess.com and Lichess.
 * They live apart from the arrows the coach draws, and touch screens never reach them.
 */
export class Annotations {
  private drawings: Drawing[] = [];
  private start: Start | null = null;
  private previewKey = '';

  constructor(
    private host: HTMLElement,
    private arrows: Arrows,
    private markers: Markers,
    private isFlipped: () => boolean,
  ) {
    host.addEventListener('contextmenu', this.preventMenu);
    host.addEventListener('pointerdown', this.onDown);
  }

  clear(): void {
    if (this.drawings.length === 0) return;
    this.drawings = [];
    this.render();
  }

  destroy(): void {
    this.host.removeEventListener('contextmenu', this.preventMenu);
    this.host.removeEventListener('pointerdown', this.onDown);
    this.stopDragging();
  }

  private preventMenu = (event: Event): void => event.preventDefault();

  private onDown = (event: PointerEvent): void => {
    if (event.pointerType !== 'mouse') return;
    if (event.button === 0) return this.clear();
    if (event.button !== 2) return;
    const square = this.squareAt(event);
    if (!square) return;
    this.start = { square, color: colorFor(event) };
    window.addEventListener('pointermove', this.onMove);
    window.addEventListener('pointerup', this.onUp);
  };

  private onMove = (event: PointerEvent): void => {
    const pending = this.pendingDrawing(event);
    const key = JSON.stringify(pending);
    if (key === this.previewKey) return;
    this.previewKey = key;
    this.render(pending);
  };

  private onUp = (event: PointerEvent): void => {
    if (event.button !== 2) return;
    const pending = this.pendingDrawing(event);
    this.stopDragging();
    // Letting go outside the board cancels the drawing.
    if (pending && this.squareAt(event)) this.drawings = toggleDrawing(this.drawings, pending);
    this.render();
  };

  private stopDragging(): void {
    this.start = null;
    this.previewKey = '';
    window.removeEventListener('pointermove', this.onMove);
    window.removeEventListener('pointerup', this.onUp);
  }

  private squareAt(event: PointerEvent): string | null {
    return squareAtPoint(event.clientX, event.clientY, this.host.getBoundingClientRect(), this.isFlipped());
  }

  private pendingDrawing(event: PointerEvent): Drawing | null {
    const end = this.squareAt(event);
    return this.start && end ? drawingBetween(this.start.square, end, this.start.color) : null;
  }

  /** Redraws every drawing, plus the one still being dragged. */
  private render(pending: Drawing | null = null): void {
    for (const color of COLORS) {
      this.arrows.removeArrows(ARROWS[color]);
      this.markers.removeMarkers(CIRCLES[color]);
    }
    for (const drawing of pending ? [...this.drawings, pending] : this.drawings) {
      if (drawing.kind === 'arrow') this.arrows.addArrow(ARROWS[drawing.color], drawing.from, drawing.to);
      else this.markers.addMarker(CIRCLES[drawing.color], drawing.square);
    }
  }
}
