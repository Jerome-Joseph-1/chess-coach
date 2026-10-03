import { prefersReducedMotion, SLOW_MS } from '../ui/motion';
import { burstSpecks } from './effects';
import { gridCell } from './geometry';
import type { BadgeKind } from './types';

const GOOD_MARK = '<svg viewBox="0 0 24 24"><path d="M6 12.5l4 4 8-9" /></svg>';
const BAD_MARK = '<svg viewBox="0 0 24 24"><path d="M7.5 7.5l9 9M16.5 7.5l-9 9" /></svg>';
const MARKS: Record<BadgeKind, string> = { good: GOOD_MARK, bad: BAD_MARK };
const SPECKS = 10;
/** A second burst on the same square this soon after the first is the same moment, asked for twice. */
const BURST_REPEAT_MS = 400;

interface Badge {
  kind: BadgeKind;
  cell: HTMLElement;
}

/**
 * Elements above the board that follow squares: verdict badges, bursts and the drag target outline.
 * Cells are sized in percent of the board, so a resize needs no work; only turning the board does.
 */
export class SquareOverlay {
  private layer = document.createElement('div');
  private badges = new Map<string, Badge>();
  private hoverCell = document.createElement('div');
  private hoverSquare: string | null = null;
  private lastBurst = { square: '', at: -Infinity };

  constructor(
    host: HTMLElement,
    private flipped: boolean,
  ) {
    this.layer.className = 'board-overlay';
    this.hoverCell.className = 'overlay-cell overlay-hover';
    this.hoverCell.hidden = true;
    this.layer.append(this.hoverCell);
    host.append(this.layer);
  }

  setFlipped(flipped: boolean): void {
    this.flipped = flipped;
    for (const [square, { cell }] of this.badges) this.place(cell, square);
    if (this.hoverSquare) this.place(this.hoverCell, this.hoverSquare);
  }

  badge(square: string, kind: BadgeKind | null): void {
    const current = this.badges.get(square);
    if (current?.kind === kind) return;
    current?.cell.remove();
    this.badges.delete(square);
    if (!kind) return;
    const cell = this.cell(square, `overlay-badge overlay-badge--${kind}`);
    cell.innerHTML = `<span class="badge">${MARKS[kind]}</span>`;
    this.badges.set(square, { kind, cell });
  }

  /** Green specks fly out of the square and fade; nothing under reduced motion. */
  burst(square: string): void {
    const now = performance.now();
    const repeat = this.lastBurst.square === square && now - this.lastBurst.at < BURST_REPEAT_MS;
    if (repeat || prefersReducedMotion()) return;
    this.lastBurst = { square, at: now };
    const cell = this.cell(square, 'overlay-burst');
    const flights = burstSpecks(SPECKS).map(({ x, y, size }) => {
      const speck = document.createElement('span');
      speck.className = 'burst-speck';
      speck.style.width = speck.style.height = `${size}px`;
      cell.append(speck);
      return speck.animate(
        [
          { transform: 'translate(-50%, -50%) scale(1)', opacity: 1 },
          { transform: `translate(calc(${x}px - 50%), calc(${y}px - 50%)) scale(0.5)`, opacity: 0 },
        ],
        { duration: SLOW_MS, easing: 'cubic-bezier(0.2, 0.7, 0.3, 1)', fill: 'forwards' },
      );
    });
    Promise.allSettled(flights.map((flight) => flight.finished)).then(() => cell.remove());
  }

  /** Outline the square under a dragged piece; null removes it. */
  hover(square: string | null): void {
    this.hoverSquare = square;
    this.hoverCell.hidden = !square;
    if (square) this.place(this.hoverCell, square);
  }

  destroy(): void {
    this.layer.remove();
  }

  private cell(square: string, className: string): HTMLElement {
    const cell = document.createElement('div');
    cell.className = `overlay-cell ${className}`;
    this.place(cell, square);
    this.layer.append(cell);
    return cell;
  }

  private place(cell: HTMLElement, square: string): void {
    const { column, row } = gridCell(square, this.flipped);
    cell.style.left = `${column * 12.5}%`;
    cell.style.top = `${row * 12.5}%`;
  }
}
