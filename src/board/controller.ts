import { Chess, type Move } from 'chess.js';
import { Chessboard, INPUT_EVENT_TYPE, POINTER_EVENTS, type MoveInputEvent } from 'cm-chessboard';
import { Arrows, type ArrowType } from 'cm-chessboard/src/extensions/arrows/Arrows.js';
import { Markers, type MarkerType } from 'cm-chessboard/src/extensions/markers/Markers.js';
import 'cm-chessboard/assets/chessboard.css';
import arrowsSprite from 'cm-chessboard/assets/extensions/arrows/arrows.svg?no-inline';
import markersSprite from 'cm-chessboard/assets/extensions/markers/markers.svg?no-inline';
import piecesSprite from 'cm-chessboard/assets/pieces/standard.svg?no-inline';
import type { Side } from '../content/types';
import { parseUci, toUci } from '../game/position';
import { playSound, type MoveSound } from '../ui/sound';
import { Annotations } from './annotations';
import { EvalBar } from './evalBar';
import { gridCell } from './geometry';
import { soundBetween, soundForMove } from './moveSound';
import { legalMoves, pickMove } from './moves';
import { SquareOverlay } from './overlay';
import type { ArrowTone, BadgeKind, BarScore, BoardController, MovedPiece, Tone } from './types';

type MoveHandler = (uci: string) => boolean | Promise<boolean>;

const MOVE_MS = 180;

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

  constructor(
    private host: HTMLElement,
    private cm: Chessboard,
    private markers: Markers,
    private arrows: Arrows,
    private overlay: SquareOverlay,
    private annotations: Annotations,
    fen: string,
  ) {
    this.position = fullFen(fen);
  }

  async setPosition(fen: string, animate = false): Promise<void> {
    await this.pending;
    if (this.destroyed) return;
    // A step back undoes one move, so it sounds like the move it undoes.
    const sound = animate ? (soundBetween(this.position, fen) ?? soundBetween(fullFen(fen), this.position)) : null;
    this.position = fullFen(fen);
    this.annotations.clear();
    this.setLastMove(null);
    await this.cm.setPosition(this.position, animate);
    this.knock(sound);
  }

  async playMove(uci: string): Promise<void> {
    await this.pending;
    if (this.destroyed) return;
    const chess = new Chess(this.position);
    const sound = soundForMove(chess.move(parseUci(uci)));
    this.position = chess.fen();
    this.annotations.clear();
    this.setLastMove(uci);
    await this.cm.setPosition(this.position, true);
    this.knock(sound);
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

  enableMoves(side: Side, onMove: MoveHandler): void {
    this.disableInput();
    this.cm.enableMoveInput((event) => this.handleInput(event, side, onMove), side);
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
    if (!this.destroyed) this.overlay.badge(square, kind);
  }

  arrow(from: string, to: string, tone: ArrowTone): void {
    if (this.destroyed) return;
    this.removeArrows(from, to);
    this.arrows.addArrow(ARROW_TYPES[tone], from, to);
  }

  clearArrows(): void {
    if (!this.destroyed) this.removeArrows();
  }

  burst(_square: string): void {}

  onMoved(_listener: (move: MovedPiece) => void): () => void {
    return () => {};
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
    this.annotations.destroy();
    this.overlay.destroy();
    this.bar?.destroy();
    this.cm.destroy();
  }

  private handleInput(event: MoveInputEvent, side: Side, onMove: MoveHandler): boolean | undefined {
    switch (event.type) {
      case INPUT_EVENT_TYPE.moveInputStarted:
        return this.startMove(event.squareFrom, side);
      case INPUT_EVENT_TYPE.movingOverSquare:
        this.overlay.hover(event.squareTo ?? null);
        break;
      case INPUT_EVENT_TYPE.validateMoveInput:
        return this.tryMove(event.squareFrom, event.squareTo, side, onMove);
      case INPUT_EVENT_TYPE.moveInputCanceled:
      case INPUT_EVENT_TYPE.moveInputFinished:
        this.clearMoveHints();
    }
    return undefined;
  }

  private startMove(square: string, side: Side): boolean {
    if (this.busy > 0) return false;
    const moves = legalMoves(this.position, side, square);
    if (moves.length > 0) this.showMoveHints(square, moves);
    return moves.length > 0;
  }

  /** The picked piece's square and where it can go: dots on empty squares, rings on captures. */
  private showMoveHints(square: string, moves: Move[]): void {
    this.batch(() => {
      this.markers.addMarker(SELECTED_MARKER, square);
      // A promotion lists one move per piece; draw its square once.
      const byTarget = new Map(moves.map((move) => [move.to, move]));
      for (const move of byTarget.values()) this.markers.addMarker(move.captured ? LEGAL_CAPTURE : LEGAL_DOT, move.to);
    });
  }

  private clearMoveHints(): void {
    this.overlay.hover(null);
    this.batch(() => [SELECTED_MARKER, LEGAL_DOT, LEGAL_CAPTURE].forEach((type) => this.markers.removeMarkers(type)));
  }

  private tryMove(from: string, to: string | null | undefined, side: Side, onMove: MoveHandler): boolean {
    this.clearMoveHints();
    const move = to ? pickMove(legalMoves(this.position, side, from), to) : undefined;
    if (!move) return false;

    const before = this.position;
    const previousLastMove = this.lastMove;
    const uci = toUci(move);
    const dropped = this.isDragging();
    this.annotations.clear();
    this.position = move.after;
    this.setLastMove(uci);
    // cm-chessboard moves the piece right after we return; this settles castling, en passant and promotion.
    this.enqueue(async () => {
      await this.cm.setPosition(move.after, true);
      if (dropped) this.settle(move.to);
    });

    const refuse = () => {
      this.position = before;
      this.setLastMove(previousLastMove);
      this.enqueue(() => this.cm.setPosition(before, true));
    };
    const decide = (keep: boolean) => (keep ? playSound(soundForMove(move)) : refuse());
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

  /** cm-chessboard keeps a floating copy of the piece in the page while it is dragged. */
  private isDragging(): boolean {
    return document.querySelector('.cm-chessboard-draggable-piece') !== null;
  }

  /** A dropped piece lands with a small bounce. */
  private settle(square: string): void {
    this.host.querySelector(`g[data-square='${square}']`)?.classList.add('piece-settle');
  }

  private knock(sound: MoveSound | null): void {
    if (sound && !this.destroyed) playSound(sound);
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
      { class: Markers, props: { sprite: markersSprite, autoMarkers: null } },
      { class: Arrows, props: { sprite: arrowsSprite } },
    ],
  });
  const markers = cm.getExtension(Markers)!;
  const arrows = cm.getExtension(Arrows)!;
  const overlay = new SquareOverlay(host, orientation === 'b');
  const annotations = new Annotations(host, arrows, markers, () => cm.getOrientation() === 'b');
  return new CmBoardController(host, cm, markers, arrows, overlay, annotations, fen);
}
