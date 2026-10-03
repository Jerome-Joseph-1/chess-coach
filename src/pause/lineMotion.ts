import type { BoardController } from '../board/types';
import { placement, playLine, type PlayedMove } from './position';

export interface LineData {
  played: PlayedMove[];
  /** Position before the first move, then after each move. */
  fens: string[];
}

export function lineData(fen: string, moves: string[]): LineData {
  const played = playLine(fen, moves);
  return { played, fens: [fen, ...played.map((m) => m.after)] };
}

/** True when the board shows different pieces than the position the user came from. */
export function isOffHome(shownFen: string, homeFen: string): boolean {
  return placement(shownFen) !== placement(homeFen);
}

export interface ControlState {
  /** "5 of 6". */
  count: string;
  /** The board already shows the position the user came from. */
  backDisabled: boolean;
  prevDisabled: boolean;
  nextDisabled: boolean;
}

/** What the control row under a line can do when the stepper stands at step `at`. */
export function controlState(data: LineData, at: number, homeFen: string): ControlState {
  return {
    count: `${at} of ${data.played.length}`,
    backDisabled: !isOffHome(data.fens[at], homeFen),
    prevDisabled: at === 0,
    nextDisabled: at === data.played.length,
  };
}

/** "5." before White's move, "5…" before a Black move that opens a line. */
export function moveNumbers(fen: string, played: PlayedMove[]): string[] {
  let number = Number(fen.split(' ')[5]) || 1;
  return played.map((move, i) => {
    const label = move.side === 'w' ? `${number}.` : i === 0 ? `${number}…` : '';
    if (move.side === 'b') number += 1;
    return label;
  });
}

/**
 * Walks the board along a line. Forward steps animate with playMove, backward ones use setPosition.
 * Taps made while it is busy only move the target, so quick taps queue instead of fighting.
 */
export class LineMotion {
  private data: LineData = { played: [], fens: [] };
  private target = 0;
  private at = 0;
  /** Position last handed to the board; null until the first call. */
  private shown: string | null = null;
  private rewind = false;
  private home = false;
  private stopped = false;
  private running: Promise<void> | null = null;

  constructor(
    private board: BoardController,
    private homeFen: string,
    private onStep: (step: number) => void,
  ) {}

  /** Switch to another line: the board goes to its start. */
  setLine(data: LineData): void {
    this.data = data;
    this.rewind = true;
    this.home = false;
    this.start();
  }

  /** Move toward step n of the current line (0 = before the first move). */
  goTo(n: number): void {
    this.home = false;
    this.target = Math.max(0, Math.min(this.data.played.length, n));
    this.start();
  }

  /** Where the next step would go from, counting steps still queued. */
  get heading(): number {
    return this.target;
  }

  /** Walk back to the start of the line, then show the position the user came from. */
  backToPosition(): void {
    this.target = 0;
    this.home = true;
    this.start();
  }

  /** Drop queued steps; the board is left wherever it is. */
  stop(): void {
    this.stopped = true;
  }

  /** Resolves once the board has caught up with every queued step. */
  settled(): Promise<void> {
    return this.running ?? Promise.resolve();
  }

  private start(): void {
    this.running ??= this.walk().finally(() => (this.running = null));
  }

  private async show(fen: string, animate: boolean): Promise<void> {
    if (this.shown === fen) return;
    this.shown = fen;
    await this.board.setPosition(fen, animate);
  }

  private async walk(): Promise<void> {
    while (!this.stopped) {
      const data = this.data;
      const { played, fens } = data;
      if (this.rewind) {
        this.rewind = false;
        this.at = 0;
        this.target = 0;
        await this.show(fens[0], true);
      } else if (this.target > this.at && played[this.at]) {
        await this.show(fens[this.at], false);
        await this.board.playMove(played[this.at].uci);
        if (this.data !== data) {
          this.shown = null; // the line changed mid-move; the pending rewind puts the board right
          continue;
        }
        this.at += 1;
        this.shown = fens[this.at];
      } else if (this.target < this.at) {
        this.at = this.target;
        await this.show(fens[this.at], true);
      } else if (this.home) {
        this.home = false;
        await this.show(this.homeFen, true);
      } else {
        return;
      }
      if (this.data === data) this.onStep(this.at);
    }
  }
}
