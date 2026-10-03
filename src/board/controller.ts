import { Chess, type Move, type Square } from 'chess.js';
import { Chessboard, INPUT_EVENT_TYPE, POINTER_EVENTS, type MoveInputEvent } from 'cm-chessboard';
import { Markers, type MarkerType } from 'cm-chessboard/src/extensions/markers/Markers.js';
import 'cm-chessboard/assets/chessboard.css';
import markersSprite from 'cm-chessboard/assets/extensions/markers/markers.svg?no-inline';
import piecesSprite from 'cm-chessboard/assets/pieces/standard.svg?no-inline';
import type { Side } from '../content/types';
import { parseUci, toUci, withTurn } from '../game/position';
import type { BoardController, Tone } from './types';

type MoveHandler = (uci: string) => boolean | Promise<boolean>;

const MOVE_MS = 480;

const TONE_MARKERS: Record<Tone, MarkerType> = {
  focus: { class: 'marker-focus', slice: 'markerFrame' },
  good: { class: 'marker-good', slice: 'markerSquare' },
  bad: { class: 'marker-bad', slice: 'markerSquare' },
  hint: { class: 'marker-hint', slice: 'markerCircle' },
};
const SELECTED_MARKER: MarkerType = { class: 'marker-select', slice: 'markerSquare' };
const LAST_MOVE_MARKER: MarkerType = { class: 'marker-last-move', slice: 'markerSquare' };
const DIM_MARKER: MarkerType = { class: 'marker-dim', slice: 'markerSquare', position: 'above' };

const ALL_SQUARES = [...'abcdefgh'].flatMap((file) => [1, 2, 3, 4, 5, 6, 7, 8].map((rank) => `${file}${rank}`));

function legalMoves(fen: string, side: Side, square: string): Move[] {
  try {
    return new Chess(withTurn(fen, side)).moves({ verbose: true, square: square as Square });
  } catch {
    return [];
  }
}

/** The move from the first square to the second, queening when it promotes. */
function pickMove(moves: Move[], to: string): Move | undefined {
  const candidates = moves.filter((m) => m.to === to);
  return candidates.find((m) => m.promotion === 'q') ?? candidates[0];
}

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

  constructor(
    private host: HTMLElement,
    private cm: Chessboard,
    private markers: Markers,
    fen: string,
  ) {
    this.position = fullFen(fen);
  }

  async setPosition(fen: string, animate = false): Promise<void> {
    await this.pending;
    if (this.destroyed) return;
    this.position = fullFen(fen);
    this.setLastMove(null);
    await this.cm.setPosition(this.position, animate);
  }

  async playMove(uci: string): Promise<void> {
    await this.pending;
    if (this.destroyed) return;
    const chess = new Chess(this.position);
    chess.move(parseUci(uci));
    this.position = chess.fen();
    this.setLastMove(uci);
    await this.cm.setPosition(this.position, true);
  }

  async setOrientation(side: Side): Promise<void> {
    if (this.destroyed || this.cm.getOrientation() === side) return;
    await this.cm.setOrientation(side, false);
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
    this.markers.removeLegalMovesMarkers();
  }

  squareCenter(square: string): { x: number; y: number } {
    const rect = this.host.getBoundingClientRect();
    const size = rect.width / 8;
    const file = square.charCodeAt(0) - 97;
    const rank = Number(square[1]) - 1;
    const flipped = this.cm.getOrientation() === 'b';
    const column = flipped ? 7 - file : file;
    const row = flipped ? rank : 7 - rank;
    return { x: rect.left + (column + 0.5) * size, y: rect.top + (row + 0.5) * size };
  }

  destroy(): void {
    if (this.destroyed) return;
    this.disableInput();
    this.destroyed = true;
    this.cm.destroy();
  }

  private handleInput(event: MoveInputEvent, side: Side, onMove: MoveHandler): boolean | undefined {
    switch (event.type) {
      case INPUT_EVENT_TYPE.moveInputStarted:
        return this.startMove(event.squareFrom, side);
      case INPUT_EVENT_TYPE.validateMoveInput:
        return this.tryMove(event.squareFrom, event.squareTo, side, onMove);
      case INPUT_EVENT_TYPE.moveInputCanceled:
      case INPUT_EVENT_TYPE.moveInputFinished:
        this.markers.removeLegalMovesMarkers();
    }
    return undefined;
  }

  private startMove(square: string, side: Side): boolean {
    if (this.busy > 0) return false;
    const moves = legalMoves(this.position, side, square);
    this.markers.addLegalMovesMarkers(moves);
    return moves.length > 0;
  }

  private tryMove(from: string, to: string | null | undefined, side: Side, onMove: MoveHandler): boolean {
    this.markers.removeLegalMovesMarkers();
    const move = to ? pickMove(legalMoves(this.position, side, from), to) : undefined;
    if (!move) return false;

    const before = this.position;
    const previousLastMove = this.lastMove;
    const uci = toUci(move);
    this.position = move.after;
    this.setLastMove(uci);
    // cm-chessboard moves the piece right after we return; this settles castling, en passant and promotion.
    this.enqueue(() => this.cm.setPosition(move.after, true));

    const refuse = () => {
      this.position = before;
      this.setLastMove(previousLastMove);
      this.enqueue(() => this.cm.setPosition(before, true));
    };
    this.validating = true;
    try {
      const verdict = onMove(uci);
      if (verdict instanceof Promise) {
        verdict.then((keep) => !keep && refuse(), refuse);
      } else if (!verdict) {
        refuse();
      }
    } catch (error) {
      console.error(error);
      refuse();
    } finally {
      this.validating = false;
    }
    return true;
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
    extensions: [{ class: Markers, props: { sprite: markersSprite, autoMarkers: SELECTED_MARKER } }],
  });
  return new CmBoardController(host, cm, cm.getExtension(Markers)!, fen);
}
