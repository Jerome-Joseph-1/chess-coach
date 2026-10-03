import { Chess } from 'chess.js';
import type { BoardController } from '../board/types';
import type {
  Depth,
  Game,
  GameSummary,
  Level,
  MomentResult,
  MomentType,
  OpeningId,
  SetIndex,
  StepOutcome,
  Turn,
} from '../content/types';
import type { PauseResult } from '../pause/PauseSheet';
import type { Celebration, Point } from '../ui/rewards';
import { outcomeText } from './outcome';
import { chooseMoments, hashSeed } from './pauses';
import { placement, playSan } from './position';

/** One scripted move every 600 ms while the game plays by itself. */
export const AUTOPLAY_MS = 600;
const REPLAY_PLIES = 4;
const REPLAY_MS = 250;

export interface SessionDeps {
  board: BoardController;
  loadSet(opening: OpeningId, level: Level): Promise<SetIndex | null>;
  loadGame(opening: OpeningId, level: Level, id: string): Promise<Game>;
  getDepth(opening: OpeningId, level: Level): Depth;
  isQuick(): boolean;
  playedGameIds(opening: OpeningId, level: Level): string[];
  recordMoment(result: MomentResult): { depthChanged?: Depth };
  recordGame(summary: GameSummary): void;
  celebrate(kind: Celebration, origin?: Point): void;
  toast(text: string): void;
  wait(ms: number): Promise<void>;
  random(): number;
  now(): number;
}

export type Phase =
  | { kind: 'loading' }
  | { kind: 'error'; message: string }
  /** The board moves by itself and cannot be stopped: a review replays the moves before its moment. */
  | { kind: 'busy' }
  /** The game waits for the user to press play. */
  | { kind: 'ready' }
  /** Both sides' scripted moves are being played. */
  | { kind: 'playing' }
  | { kind: 'pause'; turnIndex: number; type: 'pause' | 'nothing' }
  /** The moves have run out; the user leaves with Finish. */
  | { kind: 'done'; outcome: string };

/** One dot per pause the user will be asked about. */
export type DotState = 'todo' | 'now' | 'good' | 'bad';

export interface SessionView {
  phase: Phase;
  game: Game | null;
  depth: Depth;
  /** SAN of every move played so far, the opening moves included. */
  history: string[];
  /** Position after those moves. */
  fen: string;
  dots: DotState[];
  status: string;
}

class Stopped extends Error {}

function isPrompted(type: MomentType | undefined): type is 'pause' | 'nothing' {
  return type === 'pause' || type === 'nothing';
}

export class GameSession {
  private view: SessionView;
  private listeners = new Set<(view: SessionView) => void>();
  private game!: Game;
  private chess = new Chess();
  private ply = 0;
  private moments = new Map<number, MomentType>();
  private results: MomentResult[] = [];
  private doneDots: DotState[] = [];
  private handledPlies = new Set<number>();
  private lastUci: string | null = null;
  private pauseResolver: ((result: PauseResult) => void) | null = null;
  private running = false;
  private stopRequested = false;
  private disposed = false;
  private finished = false;

  constructor(
    private opening: OpeningId,
    private level: Level,
    private review: { gameId: string; ply: number } | undefined,
    private deps: SessionDeps,
  ) {
    this.view = {
      phase: { kind: 'loading' },
      game: null,
      depth: deps.getDepth(opening, level),
      history: [],
      fen: this.chess.fen(),
      dots: [],
      status: '',
    };
  }

  private get board(): BoardController {
    return this.deps.board;
  }

  getView(): SessionView {
    return this.view;
  }

  subscribe(listener: (view: SessionView) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  async start(): Promise<void> {
    await this.guarded(async () => {
      await this.setup();
      if (this.review) await this.autoplay();
      else this.update({ phase: { kind: 'ready' }, status: '' });
    });
  }

  /** Plays on from here until the next key position. */
  play(): void {
    if (this.view.phase.kind !== 'ready') return;
    this.stopRequested = false;
    this.update({ phase: { kind: 'playing' } });
    // A loop still finishing its last move carries on by itself.
    if (!this.running) void this.guarded(() => this.autoplay());
  }

  /** Stops after the move being played. */
  pausePlayback(): void {
    if (this.view.phase.kind !== 'playing') return;
    this.stopRequested = true;
    this.update({ phase: { kind: 'ready' } });
  }

  dispose(): void {
    this.disposed = true;
  }

  pauseDone(result: PauseResult): void {
    this.pauseResolver?.(result);
  }

  private async guarded(task: () => Promise<void>): Promise<void> {
    try {
      await task();
    } catch (error) {
      if (error instanceof Stopped) return;
      console.error(error);
      this.update({ phase: { kind: 'error', message: 'This game could not be loaded.' }, status: '' });
    }
  }

  private update(patch: Partial<SessionView>): void {
    this.view = { ...this.view, ...patch };
    this.view.dots = this.currentDots();
    this.listeners.forEach((listener) => listener(this.view));
  }

  private currentDots(): DotState[] {
    const { phase } = this.view;
    const upcoming = [...this.moments]
      .sort(([a], [b]) => a - b)
      .filter(([i, type]) => {
        const ply = this.game?.turns[i].ply ?? -1;
        return isPrompted(type) && ply >= this.ply && !this.handledPlies.has(ply);
      })
      .map(([i]): DotState => (phase.kind === 'pause' && phase.turnIndex === i ? 'now' : 'todo'));
    return [...this.doneDots, ...upcoming];
  }

  private assertAlive(): void {
    if (this.disposed) throw new Stopped();
  }

  private async until<T>(promise: Promise<T>): Promise<T> {
    const value = await promise;
    this.assertAlive();
    return value;
  }

  private async setup(): Promise<void> {
    const { opening, level, deps } = this;
    const set = await this.until(deps.loadSet(opening, level));
    if (!set) throw new Error(`No games for ${opening} ${level}`);
    const game = await this.until(deps.loadGame(opening, level, this.review?.gameId ?? this.pickGameId(set)));
    this.startGame(game);
    await this.until(this.board.setPosition(this.chess.fen(), false));
    if (this.review) await this.replayBeforeReview(this.review.ply);
  }

  private pickGameId(set: SetIndex): string {
    const played = new Set(this.deps.playedGameIds(this.opening, this.level));
    const unplayed = set.games.filter((g) => !played.has(g.id));
    if (unplayed.length > 0) return unplayed[0].id;
    return set.games[Math.floor(this.deps.random() * set.games.length)].id;
  }

  private startGame(game: Game): void {
    this.game = game;
    this.chess = new Chess();
    for (const san of game.start) this.chess.move(san);
    this.ply = 0;
    this.moments = this.chooseMomentsFor(game);
    this.update({ game, history: [...game.start], fen: this.chess.fen() });
  }

  private chooseMomentsFor(game: Game): Map<number, MomentType> {
    const { review } = this;
    if (review) {
      const index = game.turns.findIndex((t) => t.ply === review.ply);
      if (index < 0) throw new Error(`Ply ${review.ply} is not a turn of ${game.id}`);
      return new Map([[index, game.turns[index].label === 'nothing' ? 'nothing' : 'pause']]);
    }
    return chooseMoments(game.turns, this.view.depth, { quick: this.deps.isQuick(), seed: hashSeed(game.id), silent: false });
  }

  private async replayBeforeReview(reviewPly: number): Promise<void> {
    const replayFrom = Math.max(0, reviewPly - REPLAY_PLIES);
    while (this.ply < replayFrom) this.takeMove(this.game.moves[this.ply]);
    await this.until(this.board.setPosition(this.chess.fen(), false));
    this.board.setLastMove(this.lastUci);
    this.update({ phase: { kind: 'busy' }, status: 'Replaying the last moves…' });
    while (this.ply < reviewPly) {
      await this.until(this.deps.wait(REPLAY_MS));
      await this.playScripted();
    }
  }

  /** Plays the scripted moves of both sides until a prompted moment, a stop request or the end of the game. */
  private async autoplay(): Promise<void> {
    this.running = true;
    try {
      while (!this.stopRequested && !this.finished && this.ply < this.game.moves.length) {
        this.assertAlive();
        const moment = this.nextMoment();
        if (moment) await this.runPause(moment.turnIndex, moment.type);
        else await this.playPaced();
      }
    } finally {
      this.running = false;
    }
    if (!this.finished && this.ply >= this.game.moves.length) this.finish();
  }

  private nextMoment(): { turnIndex: number; type: 'pause' | 'nothing' } | null {
    const turnIndex = this.game.turns.findIndex((t) => t.ply === this.ply);
    const type = this.moments.get(turnIndex);
    if (!isPrompted(type) || this.handledPlies.has(this.ply)) return null;
    return { turnIndex, type };
  }

  /** Plays the next scripted move on the model, not on the board. */
  private takeMove(san: string): void {
    this.lastUci = playSan(this.chess, san);
    this.update({ history: [...this.view.history, san], fen: this.chess.fen() });
    this.ply++;
  }

  private async playScripted(): Promise<void> {
    this.takeMove(this.game.moves[this.ply]);
    await this.until(this.board.playMove(this.lastUci!));
  }

  /** One move per beat, however long the animation takes. */
  private async playPaced(): Promise<void> {
    await this.until(Promise.all([this.playScripted(), this.deps.wait(AUTOPLAY_MS)]));
  }

  private async runPause(turnIndex: number, type: 'pause' | 'nothing'): Promise<void> {
    this.update({ phase: { kind: 'pause', turnIndex, type }, status: '' });
    const result = await new Promise<PauseResult>((resolve) => {
      this.pauseResolver = resolve;
    });
    this.pauseResolver = null;
    this.assertAlive();

    this.record(this.game.turns[turnIndex], type, result.outcomes);
    if (this.review) {
      this.finish();
      return;
    }
    this.update({ phase: { kind: 'playing' } });
    await this.resume(result.resumePly);
  }

  /** The sheet leaves the board at the pause position; a sheet that played on is caught up without animation. */
  private async resume(resumePly: number): Promise<void> {
    while (this.ply < resumePly && this.ply < this.game.moves.length) this.takeMove(this.game.moves[this.ply]);
    if (placement(this.board.fen()) === placement(this.chess.fen())) return;
    await this.until(this.board.setPosition(this.chess.fen(), false));
    this.board.setLastMove(this.lastUci);
  }

  private record(turn: Turn, type: MomentResult['type'], outcomes: StepOutcome[]): void {
    const result: MomentResult = {
      opening: this.opening,
      level: this.level,
      gameId: this.game.id,
      ply: turn.ply,
      moveNo: turn.moveNo,
      type,
      kinds: turn.kinds,
      depth: this.view.depth,
      outcomes,
      stars: outcomes.filter((o) => o.correct).length,
      at: this.deps.now(),
    };
    if (this.review) result.review = true;
    const { depthChanged } = this.deps.recordMoment(result);
    this.results.push(result);
    this.handledPlies.add(turn.ply);
    this.doneDots.push(outcomes.length > 0 && outcomes.every((o) => o.correct) ? 'good' : 'bad');
    this.update({ depth: depthChanged ?? this.view.depth });
    if (depthChanged) {
      this.deps.celebrate('levelup');
      this.deps.toast('New step unlocked');
    }
  }

  private finish(): void {
    this.finished = true;
    const summary: GameSummary = {
      opening: this.opening,
      level: this.level,
      gameId: this.game.id,
      moments: this.results,
      at: this.deps.now(),
    };
    this.deps.recordGame(summary);
    const outcome = this.review ? 'That was the position you missed before.' : outcomeText(this.chess, this.game);
    this.update({ phase: { kind: 'done', outcome }, status: '' });
  }
}
