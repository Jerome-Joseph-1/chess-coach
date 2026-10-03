import { Chess, type Square } from 'chess.js';
import type { Side } from '../../content/types';
import type { BoardController, Tone } from '../../board/types';

export interface PieceView {
  id: number;
  /** Colour and piece letter, e.g. "wp" or "bn": the id of the sprite symbol. */
  type: string;
  square: string;
  /** Gone in the new position; kept on screen until its fade ends. */
  leaving?: boolean;
}

export interface BoardView {
  pieces: PieceView[];
  /** Whether pieces glide to their new squares or jump. */
  animate: boolean;
  highlights: Record<string, Tone>;
  lastMove: string[];
  dim: string[] | null;
  selected: string | null;
  targets: string[];
  drag: { id: number; dx: number; dy: number } | null;
}

type Mode =
  | { kind: 'off' }
  | { kind: 'moves'; side: Side; onMove: (uci: string) => boolean | Promise<boolean> }
  | { kind: 'taps'; onTap: (square: string) => void };

const FILES = 'abcdefgh';
const DRAG_PX = 6;

export function cellOf(square: string, orientation: Side): { col: number; row: number } {
  const file = FILES.indexOf(square[0]);
  const rank = Number(square[1]) - 1;
  return orientation === 'w' ? { col: file, row: 7 - rank } : { col: 7 - file, row: rank };
}

export function squareAtCell(col: number, row: number, orientation: Side): string {
  const file = orientation === 'w' ? col : 7 - col;
  const rank = orientation === 'w' ? 7 - row : row;
  return `${FILES[file]}${rank + 1}`;
}

export function parsePieces(fen: string): { type: string; square: string }[] {
  const pieces: { type: string; square: string }[] = [];
  fen
    .split(' ')[0]
    .split('/')
    .forEach((rank, i) => {
      let file = 0;
      for (const char of rank) {
        if (/\d/.test(char)) {
          file += Number(char);
          continue;
        }
        const colour = char === char.toUpperCase() ? 'w' : 'b';
        pieces.push({ type: colour + char.toLowerCase(), square: `${FILES[file]}${8 - i}` });
        file += 1;
      }
    });
  return pieces;
}

function distance(a: string, b: string): number {
  return Math.max(Math.abs(FILES.indexOf(a[0]) - FILES.indexOf(b[0])), Math.abs(Number(a[1]) - Number(b[1])));
}

/** Matches the pieces of a new position to the ones on screen, so moved pieces glide instead of reappearing. */
export function reconcile(old: PieceView[], fen: string, nextId: () => number): PieceView[] {
  const wanted = parsePieces(fen);
  const free = old.filter((p) => !p.leaving);
  const kept: PieceView[] = [];
  const missing: { type: string; square: string }[] = [];

  for (const target of wanted) {
    const same = free.findIndex((p) => p.type === target.type && p.square === target.square);
    if (same >= 0) kept.push(...free.splice(same, 1));
    else missing.push(target);
  }
  for (const target of missing) {
    const near = free
      .filter((p) => p.type === target.type)
      .sort((a, b) => distance(a.square, target.square) - distance(b.square, target.square))[0];
    if (near) {
      free.splice(free.indexOf(near), 1);
      kept.push({ ...near, square: target.square });
    } else {
      kept.push({ id: nextId(), type: target.type, square: target.square });
    }
  }
  return [...kept, ...free.map((p) => ({ ...p, leaving: true }))];
}

export function legalTargets(fen: string, from: string): string[] {
  try {
    return new Chess(fen).moves({ square: from as Square, verbose: true }).map((m) => m.to);
  } catch {
    return [];
  }
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

function moveMs(): number {
  return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 480;
}

/**
 * A small stand-in for the real board, used by the pause lab. It implements BoardController on plain state;
 * LabBoard renders that state. Animations are queued so overlapping calls play one after another.
 */
export class LabBoardModel implements BoardController {
  view: BoardView;
  private target: string;
  private mode: Mode = { kind: 'off' };
  private listeners = new Set<(view: BoardView) => void>();
  private chain: Promise<void> = Promise.resolve();
  private ids = 0;
  private el: HTMLElement | null = null;
  private press: { square: string; id: number; x: number; y: number; dragging: boolean } | null = null;

  constructor(
    fen: string,
    private orientation: Side,
  ) {
    this.target = fen;
    const pieces = reconcile([], fen, () => this.ids++);
    this.view = { pieces, animate: false, highlights: {}, lastMove: [], dim: null, selected: null, targets: [], drag: null };
  }

  attach(el: HTMLElement): void {
    this.el = el;
  }

  subscribe(listener: (view: BoardView) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private update(patch: Partial<BoardView>): void {
    this.view = { ...this.view, ...patch };
    this.listeners.forEach((listener) => listener(this.view));
  }

  private enqueue(job: () => Promise<void>): Promise<void> {
    this.chain = this.chain.then(job);
    return this.chain;
  }

  private async show(fen: string, animate: boolean): Promise<void> {
    const pieces = reconcile(this.view.pieces, fen, () => this.ids++);
    this.update({ pieces, animate, selected: null, targets: [], drag: null });
    if (!animate) return this.update({ pieces: pieces.filter((p) => !p.leaving) });
    await sleep(moveMs());
    this.update({ pieces: this.view.pieces.filter((p) => !p.leaving) });
  }

  setPosition(fen: string, animate = false): Promise<void> {
    this.target = fen;
    return this.enqueue(() => this.show(fen, animate));
  }

  playMove(uci: string): Promise<void> {
    const chess = new Chess(this.target);
    chess.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] });
    this.target = chess.fen();
    const fen = this.target;
    this.update({ lastMove: [uci.slice(0, 2), uci.slice(2, 4)] });
    return this.enqueue(() => this.show(fen, true));
  }

  fen(): string {
    return this.target;
  }

  highlight(squares: string[], tone: Tone): void {
    const highlights = { ...this.view.highlights };
    squares.forEach((square) => (highlights[square] = tone));
    this.update({ highlights });
  }

  clearHighlights(): void {
    this.update({ highlights: {} });
  }

  setLastMove(uci: string | null): void {
    this.update({ lastMove: uci ? [uci.slice(0, 2), uci.slice(2, 4)] : [] });
  }

  enableMoves(side: Side, onMove: (uci: string) => boolean | Promise<boolean>): void {
    this.mode = { kind: 'moves', side, onMove };
  }

  enableSquareTaps(onTap: (square: string) => void): void {
    this.mode = { kind: 'taps', onTap };
  }

  disableInput(): void {
    this.mode = { kind: 'off' };
    this.press = null;
    this.update({ selected: null, targets: [], drag: null });
  }

  squareCenter(square: string): { x: number; y: number } {
    const box = this.el?.getBoundingClientRect() ?? new DOMRect();
    const { col, row } = cellOf(square, this.orientation);
    return { x: box.left + ((col + 0.5) * box.width) / 8, y: box.top + ((row + 0.5) * box.height) / 8 };
  }

  dim(except: string[] | null): void {
    this.update({ dim: except });
  }

  private squareAt(x: number, y: number): string | null {
    const box = this.el?.getBoundingClientRect();
    if (!box) return null;
    const col = Math.floor(((x - box.left) / box.width) * 8);
    const row = Math.floor(((y - box.top) / box.height) * 8);
    return col < 0 || col > 7 || row < 0 || row > 7 ? null : squareAtCell(col, row, this.orientation);
  }

  private ownPiece(square: string): PieceView | undefined {
    const { mode } = this;
    const piece = this.view.pieces.find((p) => p.square === square && !p.leaving);
    return mode.kind === 'moves' && piece?.type[0] === mode.side ? piece : undefined;
  }

  private select(square: string | null): void {
    this.update({ selected: square, targets: square ? legalTargets(this.target, square) : [] });
  }

  pointerDown(x: number, y: number): void {
    const square = this.squareAt(x, y);
    const piece = square ? this.ownPiece(square) : undefined;
    this.press = square && piece ? { square, id: piece.id, x, y, dragging: false } : null;
    if (square && piece) this.select(square);
  }

  pointerMove(x: number, y: number): void {
    const press = this.press;
    if (!press) return;
    const dx = x - press.x;
    const dy = y - press.y;
    if (!press.dragging && Math.hypot(dx, dy) < DRAG_PX) return;
    press.dragging = true;
    this.update({ drag: { id: press.id, dx, dy } });
  }

  pointerUp(x: number, y: number): void {
    const press = this.press;
    this.press = null;
    const square = this.squareAt(x, y);
    if (press?.dragging) {
      this.update({ drag: null });
      if (square && this.view.targets.includes(square)) void this.commit(press.square, square, true);
      return;
    }
    if (square) this.tap(square);
  }

  private tap(square: string): void {
    const { mode } = this;
    if (mode.kind === 'taps') return mode.onTap(square);
    if (mode.kind !== 'moves') return;
    const { selected, targets } = this.view;
    if (selected && targets.includes(square)) void this.commit(selected, square, false);
    else this.select(this.ownPiece(square) ? square : null);
  }

  /** Offers a legal move to the callback; the piece stays if it says yes and goes back if it says no. */
  private async commit(from: string, to: string, dragged: boolean): Promise<void> {
    const { mode } = this;
    if (mode.kind !== 'moves') return;
    const before = this.target;
    const chess = new Chess(before);
    const promotion = chess.get(from as Square)?.type === 'p' && (to[1] === '8' || to[1] === '1') ? 'q' : undefined;
    chess.move({ from, to, promotion });
    const uci = from + to + (promotion ?? '');
    this.select(null);
    const keep = await mode.onMove(uci);
    if (keep) {
      this.update({ lastMove: [from, to] });
      await this.setPosition(chess.fen(), true);
    } else if (!dragged) {
      await this.setPosition(chess.fen(), true);
      await this.setPosition(before, true);
    }
  }
}
