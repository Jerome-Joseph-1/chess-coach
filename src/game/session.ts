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
  Side,
  StepOutcome,
  Turn,
} from '../content/types';
import type { PauseResult } from '../pause/PauseSheet';
import type { Celebration, Point } from '../ui/rewards';
import { findSibling } from './branching';
import { gradeMove, isHolding } from './grading';
import { chooseMoments, hashSeed } from './pauses';
import { parseUci, placement, playSan, sanToUci, uciToSan } from './position';

const THINK_MIN_MS = 400;
const THINK_SPREAD_MS = 300;
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
  navigate(path: string): void;
  wait(ms: number): Promise<void>;
  random(): number;
  now(): number;
}

export type Phase =
  | { kind: 'loading' }
  | { kind: 'error'; message: string }
  /** The board is moving by itself: the opponent replies or an earlier moment is replayed. */
  | { kind: 'busy' }
  | { kind: 'yourMove' }
  | { kind: 'pause'; turnIndex: number; type: 'pause' | 'nothing' }
  | { kind: 'miss'; turnIndex: number; playedUci: string }
  | { kind: 'lines'; turnIndex: number; uci: string }
  | { kind: 'done' };

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
  /** A wrong move the user can ask to see refuted. */
  showMe: { turnIndex: number; uci: string } | null;
}

type NormalOutcome = { san: string; siblingId?: string };

class Stopped extends Error {}

const sideName = (side: Side) => (side === 'w' ? 'White' : 'Black');

function isPrompted(type: MomentType | undefined): type is 'pause' | 'nothing' {
  return type === 'pause' || type === 'nothing';
}

export class GameSession {
  private view: SessionView;
  private listeners = new Set<(view: SessionView) => void>();
  private set!: SetIndex;
  private game!: Game;
  private chess = new Chess();
  private ply = 0;
  private moments = new Map<number, MomentType>();
  private results: MomentResult[] = [];
  private doneDots: DotState[] = [];
  private handledPlies = new Set<number>();
  private lastUci: string | null = null;
  private pauseResolver: ((result: PauseResult) => void) | null = null;
  private missResolver: (() => void) | null = null;
  private reenableInput: (() => void) | null = null;
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
      showMe: null,
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
    try {
      await this.setup();
      await this.play();
    } catch (error) {
      if (error instanceof Stopped) return;
      console.error(error);
      this.update({ phase: { kind: 'error', message: 'This game could not be loaded.' }, status: '' });
    }
  }

  dispose(): void {
    this.disposed = true;
    this.board.disableInput();
  }

  pauseDone(result: PauseResult): void {
    this.pauseResolver?.(result);
  }

  missContinue(): void {
    this.missResolver?.();
  }

  showLines(): void {
    const { showMe } = this.view;
    if (!showMe) return;
    this.board.disableInput();
    this.update({ phase: { kind: 'lines', ...showMe }, status: '' });
  }

  async closeLines(): Promise<void> {
    if (this.view.phase.kind !== 'lines') return;
    this.board.clearHighlights();
    this.board.dim(null);
    await this.board.setPosition(this.chess.fen(), true);
    this.board.setLastMove(this.lastUci);
    this.update({ phase: { kind: 'yourMove' }, status: 'Your move' });
    this.reenableInput?.();
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
    this.set = set;
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
    this.update({ game, history: [...game.start], fen: this.chess.fen(), phase: { kind: 'busy' } });
  }

  private chooseMomentsFor(game: Game): Map<number, MomentType> {
    const { review } = this;
    if (review) {
      const index = game.turns.findIndex((t) => t.ply === review.ply);
      if (index < 0) throw new Error(`Ply ${review.ply} is not a turn of ${game.id}`);
      return new Map([[index, game.turns[index].label === 'nothing' ? 'nothing' : 'pause']]);
    }
    return chooseMoments(game.turns, this.view.depth, { quick: this.deps.isQuick(), seed: hashSeed(game.id) });
  }

  private async replayBeforeReview(reviewPly: number): Promise<void> {
    const replayFrom = Math.max(0, reviewPly - REPLAY_PLIES);
    while (this.ply < replayFrom) this.takeMove(this.game.moves[this.ply]);
    await this.until(this.board.setPosition(this.chess.fen(), false));
    this.board.setLastMove(this.lastUci);
    this.update({ status: 'Replaying the last moves…' });
    while (this.ply < reviewPly) {
      await this.until(this.deps.wait(REPLAY_MS));
      await this.playScripted();
    }
  }

  private async play(): Promise<void> {
    while (!this.finished && this.ply < this.game.moves.length) {
      const turnIndex = this.game.turns.findIndex((t) => t.ply === this.ply);
      if (turnIndex < 0) await this.opponentMove();
      else await this.userTurn(turnIndex);
    }
    if (!this.finished) this.finish();
  }

  /** Plays the next scripted move on the model, not on the board. */
  private takeMove(san: string): void {
    this.lastUci = playSan(this.chess, san);
    this.update({ history: [...this.view.history, san], fen: this.chess.fen() });
    this.ply++;
  }

  private async playScripted(): Promise<void> {
    const san = this.game.moves[this.ply];
    this.takeMove(san);
    await this.until(this.board.playMove(this.lastUci!));
  }

  private async opponentMove(): Promise<void> {
    const side = this.chess.turn();
    this.update({ phase: { kind: 'busy' }, status: `${sideName(side)} is thinking…`, showMe: null });
    const think = THINK_MIN_MS + Math.floor(this.deps.random() * THINK_SPREAD_MS);
    await this.until(this.deps.wait(think));
    await this.playScripted();
  }

  private async userTurn(turnIndex: number): Promise<void> {
    const type = this.moments.get(turnIndex);
    if (isPrompted(type)) return this.runPause(turnIndex, type);
    if (type === 'silent') return this.runSilent(turnIndex);
    return this.runNormal(turnIndex);
  }

  /** Lets the user move; `decide` sees each legal move and says whether the board keeps it. */
  private async waitForMove<T>(decide: (uci: string, resolve: (value: T) => void) => boolean): Promise<T> {
    const value = await new Promise<T>((resolve) => {
      this.reenableInput = () => this.board.enableMoves(this.game.side, (uci) => decide(uci, resolve));
      this.reenableInput();
    });
    this.reenableInput = null;
    this.board.disableInput();
    this.assertAlive();
    return value;
  }

  private async runNormal(turnIndex: number): Promise<void> {
    this.update({ phase: { kind: 'yourMove' }, status: 'Your move', showMe: null });
    const outcome = await this.waitForMove<NormalOutcome>((uci, resolve) => {
      const result = this.judgeNormalMove(turnIndex, uci);
      if (result) resolve(result);
      return result !== null;
    });
    this.takeMove(outcome.san);
    if (outcome.siblingId) await this.switchGame(outcome.siblingId);
  }

  /** The move continues this game or a sibling of it; otherwise the user is told why it is not played. */
  private judgeNormalMove(turnIndex: number, uci: string): NormalOutcome | null {
    const san = uciToSan(this.chess.fen(), uci);
    const moves = [...this.game.moves.slice(0, this.ply), san];
    const sibling = findSibling(this.set, moves, this.game.id);
    if (sibling === this.game.id) return { san };
    if (sibling) return { san, siblingId: sibling };
    this.explainOtherMove(turnIndex, uci);
    return null;
  }

  private explainOtherMove(turnIndex: number, uci: string): void {
    const turn = this.game.turns[turnIndex];
    const next = this.game.moves[this.ply];
    const { verdict } = gradeMove(turn, uci);
    if (verdict === 'mistake') {
      const canShow = Boolean(turn.refutations[uci]);
      this.deps.toast(canShow ? 'That loses material. Tap Show me to see why.' : 'That loses material.');
      if (canShow) this.update({ showMe: { turnIndex, uci } });
    } else if (verdict === 'unknown') {
      this.deps.toast(`This game continues with ${next}.`);
    } else {
      this.deps.toast(`That works too. This game continues with ${next} — play it to go on.`);
    }
  }

  private async switchGame(id: string): Promise<void> {
    const next = await this.until(this.deps.loadGame(this.opening, this.level, id));
    this.game = next;
    this.moments = this.chooseMomentsFor(next);
    this.update({ game: next });
  }

  private async runSilent(turnIndex: number): Promise<void> {
    const turn = this.game.turns[turnIndex];
    const san = this.game.moves[this.ply];
    const scriptedUci = sanToUci(this.chess.fen(), san);
    this.update({ phase: { kind: 'yourMove' }, status: 'Your move', showMe: null });
    const played = await this.waitForMove<string>((uci, resolve) => {
      resolve(uci);
      return uci === scriptedUci;
    });

    const holds = isHolding(turn, played);
    this.record(turn, 'silent', [{ step: 'solve', correct: holds }]);
    if (holds) this.deps.celebrate('silent', this.board.squareCenter(parseUci(played).to));
    if (played === scriptedUci) {
      this.takeMove(san);
      return;
    }
    if (!holds) await this.showMiss(turnIndex, played);
    await this.playScripted();
    if (holds) this.deps.toast(`This game continues with ${san}.`);
  }

  private async showMiss(turnIndex: number, playedUci: string): Promise<void> {
    this.update({ phase: { kind: 'miss', turnIndex, playedUci }, status: '' });
    await new Promise<void>((resolve) => {
      this.missResolver = resolve;
    });
    this.missResolver = null;
    this.assertAlive();
    this.update({ phase: { kind: 'busy' } });
  }

  private async runPause(turnIndex: number, type: 'pause' | 'nothing'): Promise<void> {
    this.update({ phase: { kind: 'pause', turnIndex, type }, status: '', showMe: null });
    const result = await new Promise<PauseResult>((resolve) => {
      this.pauseResolver = resolve;
    });
    this.pauseResolver = null;
    this.assertAlive();
    this.update({ phase: { kind: 'busy' } });

    this.record(this.game.turns[turnIndex], type, result.outcomes);
    if (this.review) {
      this.finish();
      return;
    }
    // The pause sheet already moved the board; bring the model to the same point, always by at least one move.
    const resumePly = Math.max(result.resumePly, this.ply + 1);
    while (this.ply < resumePly && this.ply < this.game.moves.length) this.takeMove(this.game.moves[this.ply]);
    await this.syncBoard();
  }

  private async syncBoard(): Promise<void> {
    if (placement(this.board.fen()) === placement(this.chess.fen())) return;
    await this.until(this.board.setPosition(this.chess.fen(), true));
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
    // Silent checks get no dot, so the count never gives them away.
    if (type !== 'silent') this.doneDots.push(outcomes.length > 0 && outcomes.every((o) => o.correct) ? 'good' : 'bad');
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
    this.update({ phase: { kind: 'done' }, status: '' });
    this.deps.navigate('/recap');
  }
}
