import type { ChessboardView } from 'cm-chessboard';
import { prefersReducedMotion, PRESS_MS, QUICK_MS, SPRING } from '../ui/motion';
import { overshoot } from './effects';
import { gridCell } from './geometry';
import { EASE_LEAVE, pinToSquare, removeWhenDone, svgElement } from './svgMotion';

const CAPTURE_MS = 150;
const CHECK_GLOW_MS = 600;
const RETURN_MS = 220;
/** How far a refused piece swings past its square on the way back, in squares. */
const RETURN_SWING = 0.1;

let glowIds = 0;

/** Motion on and under the pieces, inside cm-chessboard's SVG: lifting, landing, taking and check. */
export class PieceEffects {
  /** Sits between the squares and the pieces, so a taken piece fades under the one that takes it. */
  private layer: SVGGElement;
  private glowFill: string;
  private lifted: SVGGElement | null = null;

  constructor(
    private view: ChessboardView,
    private isFlipped: () => boolean,
  ) {
    this.layer = svgElement('g', { class: 'board-fx' });
    this.glowFill = `check-glow-${++glowIds}`;
    this.layer.innerHTML = `<defs><radialGradient id="${this.glowFill}">
      <stop offset="0" stop-color="#fa412d" stop-opacity="0.9" />
      <stop offset="0.55" stop-color="#fa412d" stop-opacity="0.45" />
      <stop offset="1" stop-color="#fa412d" stop-opacity="0" />
    </radialGradient></defs>`;
    view.piecesLayer.insertBefore(this.layer, view.piecesGroup);
  }

  /** The picked piece rises a little; it stays up until `drop`. */
  lift(square: string): void {
    this.drop();
    const piece = this.pieceAt(square);
    if (!piece) return;
    pinToSquare(piece, this.view.squareWidth);
    piece.classList.add('piece-lift');
    this.lifted = piece;
  }

  drop(): void {
    this.lifted?.classList.remove('piece-lift');
    this.lifted = null;
  }

  /** A short press as a piece lands, released on the spring. */
  settle(square: string): void {
    const piece = this.pieceAt(square);
    if (!piece || prefersReducedMotion()) return;
    pinToSquare(piece, this.view.squareWidth);
    // cm-chessboard shows the landed piece a frame or two before it can be animated, so it presses down from full size.
    const press = PRESS_MS / 2;
    piece.animate(
      [{ scale: 1, easing: 'ease-out' }, { scale: 0.94, offset: press / (press + QUICK_MS), easing: SPRING }, { scale: 1 }],
      { duration: press + QUICK_MS },
    );
  }

  /** A refused piece, back on `square`, swings a touch past it and returns. */
  swingBack(square: string, cameFrom: string): void {
    const piece = this.pieceAt(square);
    if (!piece || prefersReducedMotion()) return;
    const flipped = this.isFlipped();
    const push = overshoot(gridCell(cameFrom, flipped), gridCell(square, flipped), RETURN_SWING * this.view.squareWidth);
    piece.animate([{ translate: '0 0' }, { translate: `${push.x}px ${push.y}px`, offset: 0.35 }, { translate: '0 0' }], {
      duration: RETURN_MS,
      easing: 'ease-out',
    });
  }

  /**
   * The piece on `square` shrinks and fades where it stood. cm-chessboard removes the real one itself,
   * so a copy plays the exit and the real one hides.
   */
  capture(square: string): void {
    const piece = this.pieceAt(square);
    if (!piece) return;
    const ghost = piece.cloneNode(true) as SVGGElement;
    ghost.removeAttribute('data-square');
    ghost.removeAttribute('data-piece');
    ghost.removeAttribute('style');
    ghost.querySelector('use')?.removeAttribute('class');
    ghost.setAttribute('class', 'capture-ghost');
    this.layer.append(ghost);
    piece.style.visibility = 'hidden';
    pinToSquare(ghost, this.view.squareWidth);
    const exit = prefersReducedMotion()
      ? ghost.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 100, fill: 'forwards' })
      : ghost.animate([{ scale: 1, opacity: 1 }, { scale: 0.6, opacity: 0 }], { duration: CAPTURE_MS, easing: EASE_LEAVE, fill: 'forwards' });
    removeWhenDone(exit, ghost);
  }

  /** A red glow on the checked king's square, in and out once. */
  checkGlow(square: string): void {
    const { x, y } = this.view.squareToPoint(square);
    const size = this.view.squareWidth;
    const glow = svgElement('rect', { class: 'check-glow', x, y, width: size, height: size, fill: `url(#${this.glowFill})` });
    this.layer.append(glow);
    const pulse = glow.animate([{ opacity: 0 }, { opacity: 1 }, { opacity: 0 }], {
      duration: CHECK_GLOW_MS,
      easing: 'ease-in-out',
      fill: 'forwards',
    });
    removeWhenDone(pulse, glow);
  }

  private pieceAt(square: string): SVGGElement | null {
    return this.view.piecesGroup.querySelector<SVGGElement>(`g[data-square='${square}']`);
  }
}
