import type { BoardController } from '../board/types';
import { squaresOf } from './position';
import { fenAt, type Sequence } from './sequence';

/** How long a move's arrow shows before the piece moves. */
export const ARROW_MS = 250;
/** Autoplay: from the start of one move to the start of the next. */
export const STEP_MS = 1100;
/** Autoplay: the least time a move stays on show, when the move itself took most of its step. */
export const DWELL_MIN_MS = 400;
/** Autoplay on opening: the pause before the first move, so the headline can be read first. */
export const LEAD_MS = 600;

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export interface ControlState {
  prevDisabled: boolean;
  nextDisabled: boolean;
  /** Moves remain and nothing is playing them: the next button invites a tap. */
  pulseNext: boolean;
}

/** What the two arrows beside the caption can do when the stepper stands at step `at`. */
export function controlState(sequence: Sequence, at: number, playing: boolean): ControlState {
  const atEnd = at === sequence.steps.length;
  return { prevDisabled: at === 0, nextDisabled: atEnd, pulseNext: !playing && !atEnd };
}

/**
 * Walks the board along a sequence of moves. Forward steps show the move's arrow, then animate with
 * playMove; backward ones use setPosition. It can also play the sequence on its own, a move every STEP_MS.
 * Taps made while it is busy only move the target, so quick taps queue instead of fighting.
 */
export class LineMotion {
  private sequence: Sequence = { steps: [] };
  private target = 0;
  private at = 0;
  /** Position last handed to the board; null until the first call. */
  private shown: string | null = null;
  /** Step to jump to before anything else; null when there is no jump pending. */
  private rewind: number | null = null;
  private stopped = false;
  private running: Promise<void> | null = null;
  private playing = false;
  /** Changes whenever autoplay starts or stops, so an old autoplay loop ends itself. */
  private playId = 0;

  constructor(
    private board: BoardController,
    private onStep: (step: number) => void,
    private onPlaying: (playing: boolean) => void,
  ) {}

  /** Switch to another sequence: the board goes to its start, or straight to step `at`. */
  setSequence(sequence: Sequence, at = 0): void {
    this.pause();
    this.sequence = sequence;
    this.rewind = Math.max(0, Math.min(sequence.steps.length, at));
    this.start();
  }

  /** Move toward step n (0 = before the first move); stops autoplay. */
  goTo(n: number): void {
    this.pause();
    this.moveTo(n);
  }

  /** Where the next step would go from, counting steps still queued. */
  get heading(): number {
    return this.target;
  }

  /** Step through the rest of the sequence on its own, after `leadMs`. */
  play(leadMs = 0): void {
    if (this.playing || this.stopped) return;
    this.setPlaying(true);
    void this.autoplay(++this.playId, leadMs);
  }

  pause(): void {
    this.playId += 1;
    this.setPlaying(false);
  }

  /** Back to the start and play it again. */
  replay(leadMs = 0): void {
    this.setSequence(this.sequence);
    this.play(leadMs);
  }

  /** Drop queued steps, autoplay and the arrow on show; the board is left wherever it is, for whoever takes it over. */
  stop(): void {
    this.stopped = true;
    this.pause();
    this.board.clearArrows();
  }

  /** Resolves once the board has caught up with every queued step. */
  settled(): Promise<void> {
    return this.running ?? Promise.resolve();
  }

  private setPlaying(playing: boolean): void {
    if (this.playing === playing) return;
    this.playing = playing;
    this.onPlaying(playing);
  }

  private async autoplay(id: number, leadMs: number): Promise<void> {
    const alive = () => this.playId === id;
    if (leadMs > 0) await sleep(leadMs);
    while (alive() && this.target < this.sequence.steps.length) {
      const started = Date.now();
      this.moveTo(this.target + 1);
      await this.settled();
      if (alive() && this.target < this.sequence.steps.length) await sleep(Math.max(DWELL_MIN_MS, STEP_MS - (Date.now() - started)));
    }
    if (alive()) this.setPlaying(false);
  }

  private moveTo(n: number): void {
    this.target = Math.max(0, Math.min(this.sequence.steps.length, n));
    this.start();
  }

  private start(): void {
    this.running ??= this.walk().finally(() => (this.running = null));
  }

  private async show(fen: string, animate: boolean): Promise<void> {
    this.board.clearArrows();
    if (this.shown === fen) return;
    this.shown = fen;
    await this.board.setPosition(fen, animate);
  }

  private async walk(): Promise<void> {
    while (!this.stopped) {
      const sequence = this.sequence;
      if (!(await this.act(sequence))) return;
      if (this.sequence === sequence) this.onStep(this.at);
    }
  }

  /** One action toward the target; false when there is nothing left to do. */
  private async act(sequence: Sequence): Promise<boolean> {
    if (this.rewind !== null) {
      this.at = this.rewind;
      this.target = this.rewind;
      this.rewind = null;
      await this.show(fenAt(sequence, this.at), true);
    } else if (this.target > this.at && sequence.steps[this.at]) {
      await this.stepForward(sequence);
    } else if (this.target < this.at) {
      this.at = this.target;
      await this.show(fenAt(sequence, this.at), true);
    } else {
      return false;
    }
    return true;
  }

  private async stepForward(sequence: Sequence): Promise<void> {
    const { uci, before, after, tone } = sequence.steps[this.at];
    // Between two lines the board first goes back to where the next one starts.
    await this.show(before, true);
    this.board.arrow(...squaresOf(uci), tone);
    await sleep(ARROW_MS);
    if (this.stopped) return;
    if (!this.stillHeadingForward(sequence)) {
      this.board.clearArrows();
      return;
    }
    await this.board.playMove(uci);
    if (this.stopped) return;
    this.board.clearArrows();
    if (this.sequence !== sequence) {
      this.shown = null; // the sequence changed mid-move; the pending rewind puts the board right
      return;
    }
    this.at += 1;
    this.shown = after;
  }

  /** False when a tap during the arrow turned the walk around, or the sequence or the stepper changed. */
  private stillHeadingForward(sequence: Sequence): boolean {
    return !this.stopped && this.sequence === sequence && this.rewind === null && this.target > this.at;
  }
}
