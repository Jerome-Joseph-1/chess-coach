import { Chess, type Move } from 'chess.js';
import { Chessboard, INPUT_EVENT_TYPE, POINTER_EVENTS, type MoveInputEvent } from 'cm-chessboard';
import type { ArrowType } from 'cm-chessboard/src/extensions/arrows/Arrows.js';
import type { MarkerType } from 'cm-chessboard/src/extensions/markers/Markers.js';
import 'cm-chessboard/assets/chessboard.css';
import arrowsSprite from 'cm-chessboard/assets/extensions/arrows/arrows.svg?no-inline';
import markersSprite from 'cm-chessboard/assets/extensions/markers/markers.svg?no-inline';
import piecesSprite from 'cm-chessboard/assets/pieces/standard.svg?no-inline';
import type { Side } from '../content/types';
import { parseUci, toUci } from '../game/position';
import { SPRING } from '../ui/motion';
import { playSound } from '../ui/sound';
import { Annotations } from './annotations';
import { ringDelays } from './effects';
import { EvalBar } from './evalBar';
import { BoardArrows, BoardMarkers, type Entrance } from './extensions';
import { gridCell } from './geometry';
import { soundForMove } from './moveSound';
import { capturedSquare, checkedKing, isOwnPiece, legalMoves, movedPiece, pickMove, stepBetween } from './moves';
import { SquareOverlay } from './overlay';
import { PieceEffects } from './pieceEffects';
import type { ArrowTone, BadgeKind, BarScore, BoardController, IllegalHandler, MovedPiece, Tone } from './types';

type MoveHandler = (uci: string) => boolean | Promise<boolean>;
type MovedListener = (move: MovedPiece) => void;

const MOVE_MS = 180;
/** The legal-move marks of the farthest ring start by this, so the whole set is in within 200 ms. */
const LAST_RING_MS = 80;
const STAGGER_FALLBACK_MS = 50;
const DOT_GROW: Entrance['timing'] = { duration: 120, easing: SPRING };
const HINT_BREATHE: Entrance = {
  keyframes: [{ scale: 1 }, { scale: 1.06 }, { scale: 1 }],
  timing: { duration: 700, iterations: 2, easing: 'ease-in-out' },
};

const TONE_MARKERS: Record<Tone, MarkerType> = {
  focus: { class: 'marker-focus', slice: 'markerFrame' },
  good: { class: 'marker-good', slice: 'markerSquare' },
  bad: { class: 'marker-bad', slice: 'markerSquare' },
  hint: { class: 'marker-hint', slice: 'markerCircle' },
};
const SELECTED_MARKER: MarkerType = { class: 'marker-select', slice: 'markerSquare' };
// The dot keeps cm-chessboard's class name, which the e2e helpers look for.
const LEGAL_DOT: MarkerType = { class: 'marker-dot', slice: 'markerDot', position: 'above' };
const LEGAL_CAPTURE: MarkerType = { class: 'marker-capture', slice: 'markerCircle', position: 'above' };
const LAST_MOVE_MARKER: MarkerType = { class: 'marker-last-move', slice: 'markerSquare' };
const DIM_MARKER: MarkerType = { class: 'marker-dim', slice: 'markerSquare', position: 'above' };

const ARROW_TYPES: Record<ArrowTone, ArrowType> = {
  best: { class: 'arrow-best' },
  threat: { class: 'arrow-threat' },
  mistake: { class: 'arrow-mistake' },
};

const ALL_SQUARES = [...'abcdefgh'].flatMap((file) => [1, 2, 3, 4, 5, 6, 7, 8].map((rank) => `${file}${rank}`));

function fullFen(fen: string): string {
  return fen.includes(' ') ? fen : `${fen} w - - 0 1`;
}

export class CmBoardController implements BoardController {
  /** Full FEN, already updated for a move the user has just made. */
  private position: string;
  private lastMove: string | null = null;
  /** Visual follow-ups of the user's moves; other calls wait for them so the board never races itself. */
  private pending: Promise<unknown> = Promise.resolve();
  private busy = 0;
  private validating = false;
  private destroyed = false;
  private bar: EvalBar | null = null;
  private movedListeners = new Set<MovedListener>();
  /** When each legal-move mark of the held piece appears. */
  private ringDelay = new Map<string, number>();
  private staggerMs: number;

  constructor(
    private host: HTMLElement,
    private cm: Chessboard,
    private markers: BoardMarkers,
    private arrows: BoardArrows,
    private overlay: SquareOverlay,
    private annotations: Annotations,
    private effects: PieceEffects,
    fen: string,
  ) {
    this.position = fullFen(fen);
    this.staggerMs = parseFloat(getComputedStyle(host).getPropertyValue('--stagger')) || STAGGER_FALLBACK_MS;
    markers.entrance = (type, square) => this.markerEntrance(type, square);
  }

  async setPosition(fen: string, animate = false): Promise<void> {
    await this.pending;
    if (this.destroyed) return;
    const target = fullFen(fen);
    const step = animate ? stepBetween(this.position, target) : null;
    this.position = target;
    this.annotations.clear();
    this.setLastMove(null);
    if (step) await this.showMove(step.move, target, step.undo);
    else await this.cm.setPosition(target, animate);
  }

  async playMove(uci: string): Promise<void> {
    await this.pending;
    if (this.destroyed) return;
    const move = new Chess(this.position).move(parseUci(uci));
    this.position = move.after;
    this.annotations.clear();
    this.setLastMove(uci);
    await this.showMove(move, move.after);
  }

  async setOrientation(side: Side): Promise<void> {
    if (this.destroyed || this.cm.getOrientation() === side) return;
    await this.cm.setOrientation(side, false);
    this.overlay.setFlipped(side === 'b');
    this.bar?.setFlipped(side === 'b');
  }

  fen(): string {
    return this.position;
  }

  highlight(squares: string[], tone: Tone): void {
    this.batch(() => squares.forEach((square) => this.markers.addMarker(TONE_MARKERS[tone], square)));
  }

  clearHighlights(): void {
    this.batch(() => Object.values(TONE_MARKERS).forEach((type) => this.markers.removeMarkers(type)));
  }

  setLastMove(uci: string | null): void {
    this.lastMove = uci;
    this.batch(() => {
      this.markers.removeMarkers(LAST_MOVE_MARKER);
      if (!uci) return;
      const { from, to } = parseUci(uci);
      this.markers.addMarker(LAST_MOVE_MARKER, from);
      this.markers.addMarker(LAST_MOVE_MARKER, to);
    });
  }

  dim(except: string[] | null): void {
    this.batch(() => {
      this.markers.removeMarkers(DIM_MARKER);
      if (!except?.length) return;
      for (const square of ALL_SQUARES) {
        if (!except.includes(square)) this.markers.addMarker(DIM_MARKER, square);
      }
    });
  }

  enableMoves(side: Side, onMove: MoveHandler, onIllegal?: IllegalHandler): void {
    this.disableInput();
    this.cm.enableMoveInput((event) => this.handleInput(event, side, onMove, onIllegal), side);
  }

  enableSquareTaps(onTap: (square: string) => void): void {
    this.disableInput();
    this.cm.enableSquareSelect(POINTER_EVENTS.pointerdown, ({ square }) => {
      if (square) onTap(square);
    });
  }

  disableInput(): void {
    if (this.destroyed) return;
    // Cancelling while a move is being validated or finished would undo it; nothing is held then anyway.
    if (!this.validating && this.busy === 0) this.cm.cancelMoveInput();
    this.cm.disableMoveInput();
    if (this.cm.isSquareSelectEnabled()) this.cm.disableSquareSelect(POINTER_EVENTS.pointerdown);
    this.clearMoveHints();
  }

  squareCenter(square: string): { x: number; y: number } {
    const rect = this.host.getBoundingClientRect();
    const size = rect.width / 8;
    const { column, row } = gridCell(square, this.cm.getOrientation() === 'b');
    return { x: rect.left + (column + 0.5) * size, y: rect.top + (row + 0.5) * size };
  }

  badge(square: string, kind: BadgeKind | null): void {
    if (this.destroyed) return;
    this.overlay.badge(square, kind);
    // A found move is celebrated where it lands; a burst asked for on top of this one is folded into it.
    if (kind === 'good') this.overlay.burst(square);
  }

  arrow(from: string, to: string, tone: ArrowTone): void {
    if (this.destroyed) return;
    this.removeArrows(from, to);
    this.arrows.addArrow(ARROW_TYPES[tone], from, to);
  }

  clearArrows(): void {
    if (!this.destroyed) this.removeArrows();
  }

  burst(square: string): void {
    if (!this.destroyed) this.overlay.burst(square);
  }

  onMoved(listener: MovedListener): () => void {
    this.movedListeners.add(listener);
    return () => this.movedListeners.delete(listener);
  }

  evalBar(score: BarScore | null): void {
    if (this.destroyed || (!score && !this.bar)) return;
    this.bar ??= new EvalBar(this.host, this.cm.getOrientation() === 'b');
    this.bar.show(score);
  }

  destroy(): void {
    if (this.destroyed) return;
    this.disableInput();
    this.destroyed = true;
    this.movedListeners.clear();
    this.annotations.destroy();
    this.overlay.destroy();
    this.bar?.destroy();
    this.cm.destroy();
  }

  private handleInput(event: MoveInputEvent, side: Side, onMove: MoveHandler, onIllegal?: IllegalHandler): boolean | undefined {
    switch (event.type) {
      case INPUT_EVENT_TYPE.moveInputStarted:
        return this.startMove(event.squareFrom, side, onIllegal);
      case INPUT_EVENT_TYPE.movingOverSquare:
        this.overlay.hover(event.squareTo ?? null);
        break;
      case INPUT_EVENT_TYPE.validateMoveInput:
        return this.tryMove(event.squareFrom, event.squareTo, side, onMove, onIllegal);
      case INPUT_EVENT_TYPE.moveInputCanceled:
      case INPUT_EVENT_TYPE.moveInputFinished:
        this.clearMoveHints();
    }
    return undefined;
  }

  private startMove(square: string, side: Side, onIllegal?: IllegalHandler): boolean {
    if (this.busy > 0) return false;
    const moves = legalMoves(this.position, side, square);
    if (moves.length === 0) {
      onIllegal?.(square, null);
      return false;
    }
    this.showMoveHints(square, moves);
    this.effects.lift(square);
    return true;
  }

  /** The picked piece's square and where it can go: dots on empty squares, rings on captures, nearest first. */
  private showMoveHints(square: string, moves: Move[]): void {
    // A promotion lists one move per piece; draw its square once.
    const byTarget = new Map(moves.map((move) => [move.to, move]));
    this.ringDelay = ringDelays(square, [...byTarget.keys()], this.staggerMs, LAST_RING_MS);
    this.batch(() => {
      this.markers.addMarker(SELECTED_MARKER, square);
      for (const move of byTarget.values()) this.markers.addMarker(move.captured ? LEGAL_CAPTURE : LEGAL_DOT, move.to);
    });
  }

  private clearMoveHints(): void {
    this.overlay.hover(null);
    this.effects.drop();
    this.batch(() => [SELECTED_MARKER, LEGAL_DOT, LEGAL_CAPTURE].forEach((type) => this.markers.removeMarkers(type)));
  }

  private markerEntrance(type: MarkerType, square: string): Entrance | null {
    if (type === LEGAL_DOT || type === LEGAL_CAPTURE) {
      return { keyframes: [{ scale: 0 }, { scale: 1 }], timing: { ...DOT_GROW, delay: this.ringDelay.get(square) ?? 0 } };
    }
    return type === TONE_MARKERS.hint ? HINT_BREATHE : null;
  }

  private tryMove(from: string, to: string | null | undefined, side: Side, onMove: MoveHandler, onIllegal?: IllegalHandler): boolean {
    this.clearMoveHints();
    const move = to ? pickMove(legalMoves(this.position, side, from), to) : undefined;
    if (!move) {
      // A tap on another piece of the same side picks that piece instead.
      if (to && !isOwnPiece(this.position, to, side)) onIllegal?.(from, to);
      return false;
    }

    const before = this.position;
    const previousLastMove = this.lastMove;
    const uci = toUci(move);
    const enPassant = move.flags.includes('e');
    this.annotations.clear();
    this.position = move.after;
    this.setLastMove(uci);
    // cm-chessboard moves the piece, and takes what stands on the target square, right after we return.
    if (move.captured && !enPassant) this.effects.capture(move.to);
    // This settles castling, en passant and promotion, which cm-chessboard does not know about.
    this.enqueue(async () => {
      if (enPassant) this.effects.capture(capturedSquare(move)!);
      await this.cm.setPosition(move.after, true);
      this.effects.settle(move.to);
    });

    const refuse = () => {
      this.position = before;
      this.setLastMove(previousLastMove);
      this.enqueue(async () => {
        await this.cm.setPosition(before, true);
        this.effects.swingBack(move.from, move.to);
      });
    };
    const keep = () => {
      playSound(soundForMove(move));
      this.emitMoved(movedPiece(move));
      this.enqueue(async () => this.markCheck(move.after));
    };
    const decide = (kept: boolean) => (kept ? keep() : refuse());
    this.validating = true;
    try {
      const verdict = onMove(uci);
      if (verdict instanceof Promise) verdict.then(decide, refuse);
      else decide(verdict);
    } catch (error) {
      console.error(error);
      refuse();
    } finally {
      this.validating = false;
    }
    return true;
  }

  /** Only the coach's arrows; the player's own drawings stay. */
  private removeArrows(from?: string, to?: string): void {
    for (const type of Object.values(ARROW_TYPES)) this.arrows.removeArrows(type, from, to);
  }

  /** Animates one move, or taking it back: the taken piece leaves as the mover arrives, then the knock and any check. */
  private async showMove(move: Move, target: string, undo = false): Promise<void> {
    const taken = undo ? null : capturedSquare(move);
    if (taken) this.effects.capture(taken);
    this.emitMoved(movedPiece(move, undo));
    await this.cm.setPosition(target, true);
    if (this.destroyed) return;
    playSound(soundForMove(move));
    this.markCheck(target);
  }

  private markCheck(fen: string): void {
    const king = checkedKing(fen);
    if (king && !this.destroyed) this.effects.checkGlow(king);
  }

  private emitMoved(move: MovedPiece): void {
    for (const listener of [...this.movedListeners]) {
      try {
        listener(move);
      } catch (error) {
        console.error(error);
      }
    }
  }

  private enqueue(task: () => Promise<void>): void {
    this.busy++;
    this.pending = this.pending
      .then(async () => {
        if (!this.destroyed) await task();
      })
      .catch((error) => console.error(error))
      .finally(() => this.busy--);
  }

  /** addMarker redraws every marker each time; changing many at once redraws once. */
  private batch(change: () => void): void {
    if (this.destroyed) return;
    this.markers.batchUpdate = true;
    try {
      change();
    } finally {
      this.markers.batchUpdate = false;
      this.markers.onRedrawBoard();
    }
  }
}

export function createBoardController(host: HTMLElement, fen: string, orientation: Side): CmBoardController {
  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const cm = new Chessboard(host, {
    position: fen,
    orientation,
    assetsUrl: '',
    style: {
      cssClass: 'coach',
      borderType: 'none',
      animationDuration: reduceMotion ? 0 : MOVE_MS,
      pieces: { file: piecesSprite, tileSize: 40 },
    },
    extensions: [
      { class: BoardMarkers, props: { sprite: markersSprite, autoMarkers: null } },
      { class: BoardArrows, props: { sprite: arrowsSprite, drawIn: Object.values(ARROW_TYPES) } },
    ],
  });
  const markers = cm.getExtension(BoardMarkers)!;
  const arrows = cm.getExtension(BoardArrows)!;
  const isFlipped = () => cm.getOrientation() === 'b';
  const overlay = new SquareOverlay(host, orientation === 'b');
  const annotations = new Annotations(host, arrows, markers, isFlipped);
  const effects = new PieceEffects(cm.view, isFlipped);
  return new CmBoardController(host, cm, markers, arrows, overlay, annotations, effects, fen);
}
