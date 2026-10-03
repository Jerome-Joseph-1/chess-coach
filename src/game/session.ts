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
  Turn,
} from '../content/types';
import type { OpeningNote } from '../opening';
import type { PauseResult } from '../pause/PauseSheet';
import type { Celebration, Point } from '../ui/rewards';
import { outcomeText } from './outcome';
import { beat } from './pacing';
import { chooseMoments, hashSeed } from './pauses';
import { placement, playSan } from './position';

/** After a key position, the game waits this long before it plays on. */
export const RESUME_MS = 300;
const STALE_REVIEW = 'This position is no longer in the course, so it is off your review list.';
const REPLAY_PLIES = 4;
const REPLAY_MS = 250;
/** A note is shown in full this many times; after that only the variation's name is shown. */
const FULL_READS = 2;
/** Autoplay stops for at most this many new plans in one game. */
const MAX_NOTE_STOPS = 2;

export interface SessionDeps {
  board: BoardController;
  loadSet(opening: OpeningId, level: Level): Promise<SetIndex | null>;
  loadGame(opening: OpeningId, level: Level, id: string): Promise<Game>;
  getDepth(opening: OpeningId, level: Level): Depth;
  isQuick(): boolean;
  playedGameIds(opening: OpeningId, level: Level): string[];
  recordMoment(result: MomentResult): { depthChanged?: Depth };
  recordGame(summary: GameSummary): void;
  dropReview(opening: OpeningId, level: Level, gameId: string, ply: number): void;
  celebrate(kind: Celebration, origin?: Point): void;
  toast(text: string): void;
  wait(ms: number): Promise<void>;
  random(): number;
  now(): number;
  /** The coach's note on a position of the opening, reached with `lastSan`. */
  noteFor(fen: string, lastSan: string | null): OpeningNote | null;
  noteSeenCount(id: string): number;
  markNoteSeen(id: string): void;
  /** The user asked autoplay to stop on every new note, not only on a new plan. */
  stopsAtEveryNote(): boolean;
  /** No game has been played to the end yet. */
  isFirstGame(): boolean;
}

export type PausedType = 'pause' | 'nothing';

export type Phase =
  | { kind: 'loading' }
  | { kind: 'error'; message: string }
  /** The board moves by itself and cannot be stopped: a review replays the moves before its moment. */
  | { kind: 'busy' }
  /** The game waits: for play, or for the user to step through the moves. */
  | { kind: 'ready' }
  /** Both sides' scripted moves are being played. */
  | { kind: 'playing' }
  /** A key position is open; `practice` marks one asked again after it was answered. */
  | { kind: 'pause'; turnIndex: number; type: PausedType; practice?: true }
  /** The moves have run out; the user leaves with Finish. */
  | { kind: 'done'; outcome: string };

/** One dot per pause the user will be asked about. */
export type DotState = 'todo' | 'now' | 'good' | 'bad';

/** Which of the step buttons can be used right now. */
export interface Controls {
  back: boolean;
  forward: boolean;
  previousKey: boolean;
}

export interface SessionView {
  phase: Phase;
  game: Game | null;
  depth: Depth;
  /** SAN of every move played so far, the opening moves included. */
  history: string[];
  /** How many of those moves the board shows; fewer while the user looks back. */
  shown: number;
  /** Position after the moves shown. */
  fen: string;
  dots: DotState[];
  controls: Controls;
  /** The board is away from the live position, or a practice has just ended: the main button says Continue. */
  returning: boolean;
  status: string;
  /** The opening the moves shown have reached, and the coach's note on them while it is new to the user. */
  note: { name: string | null; text: string | null } | null;
  /** Autoplay stopped on a new note so the user can read it; Continue plays on. */
  held: boolean;
  /** The user's first game has not started: the coach says how a game works instead of a note. */
  intro: boolean;
}

class Stopped extends Error {}

const NO_CONTROLS: Controls = { back: false, forward: false, previousKey: false };

/** A scripted move and the position it leads to. */
interface Step {
  uci: string;
  fen: string;
}

function isPrompted(type: MomentType | undefined): type is PausedType {
  return type === 'pause' || type === 'nothing';
}

export class GameSession {
  private view: SessionView;
  private listeners = new Set<(view: SessionView) => void>();
  private game!: Game;
  private startFen = '';
  private steps: Step[] = [];
  /** Scripted moves played so far: the live position. */
  private ply = 0;
  /** Scripted moves the board shows; below `ply` while the user looks back. */
  private viewPly = 0;
  /** Moves autoplay has played since Play, Continue or the last key position. */
  private streak = 0;
  private moments = new Map<number, MomentType>();
  private results: MomentResult[] = [];
  private doneDots: DotState[] = [];
  private handledPlies = new Set<number>();
  /** Notes counted as read in this game: they stay in full whenever their position is shown again. */
  private readNotes = new Set<string>();
  /** How often autoplay has stopped on a note in this game. */
  private noteStops = 0;
  /** Answered key positions and the moves their panel played: the question was the lesson there, so no note. */
  private quietPlies = new Set<number>();
  private pauseResolver: ((result: PauseResult) => void) | null = null;
  /** Everything that moves the board runs here, one task at a time. */
  private queue: Promise<void> = Promise.resolve();
  private autoplayQueued = false;
  private moving = false;
  private practiced = false;
  private disposed = false;
  private finished = false;
  private readonly firstGame: boolean;

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
      shown: 0,
      fen: new Chess().fen(),
      dots: [],
      controls: NO_CONTROLS,
      returning: false,
      status: '',
      note: null,
      held: false,
      intro: false,
    };
    this.firstGame = !review && deps.isFirstGame();
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
      if (!(await this.setup())) return;
      if (this.review) await this.askNextMoment();
      else {
        this.readShownNote();
        this.update({ phase: { kind: 'ready' }, status: '' });
      }
    });
  }

  /** Plays on from the live position until the next key position; from an earlier move it first goes back there. */
  play(): void {
    if (this.view.phase.kind !== 'ready') return;
    this.practiced = false;
    this.update({ phase: { kind: 'playing' }, held: false });
    // A loop still finishing its last move carries on by itself.
    if (this.autoplayQueued) return;
    this.autoplayQueued = true;
    this.enqueue(async () => {
      try {
        await this.resume();
      } finally {
        this.autoplayQueued = false;
      }
    });
  }

  /** Stops after the move being played. */
  pausePlayback(): void {
    if (this.view.phase.kind !== 'playing') return;
    this.update({ phase: { kind: 'ready' } });
  }

  /** One move back through the moves already played. */
  stepBack(): void {
    if (this.viewPly === 0) return;
    this.runManual(() => this.showPly(this.viewPly - 1));
  }

  /** One move on: through the moves already played, then a new scripted move; a key position it reaches opens. */
  stepForward(): void {
    this.runManual(async () => {
      if (this.viewPly < this.ply || !this.nextMoment()) await this.playForward();
      if (this.viewPly === this.ply && this.isDue()) this.play();
    });
  }

  /** Back to the latest key position before this point, to try it again as practice. */
  previousKeyPosition(): void {
    const target = this.previousKeyPly();
    if (target === null) return;
    this.runManual(() => this.practice(target));
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

  private enqueue(task: () => Promise<void>): void {
    this.queue = this.queue.then(() =>
      this.guarded(async () => {
        this.assertAlive();
        await task();
      }),
    );
  }

  /** A move or jump the user asked for; autoplay stops first and the step buttons wait until it is done. */
  private runManual(task: () => Promise<void>): void {
    if (!this.canStep()) return;
    this.pausePlayback();
    this.setMoving(true);
    this.enqueue(async () => {
      try {
        if (!this.finished) await task();
        if (!this.isPlaying()) this.readShownNote();
      } finally {
        this.setMoving(false);
      }
    });
  }

  private canStep(): boolean {
    const { kind } = this.view.phase;
    return (kind === 'ready' || kind === 'playing') && !this.moving;
  }

  private setMoving(moving: boolean): void {
    this.moving = moving;
    this.update();
  }

  private isPlaying(): boolean {
    return this.view.phase.kind === 'playing';
  }

  private update(patch: Partial<SessionView> = {}): void {
    this.view = { ...this.view, ...patch };
    if (this.view.game) this.view = { ...this.view, ...this.derived() };
    this.listeners.forEach((listener) => listener(this.view));
  }

  /** What follows from the moves played and the one being looked at. */
  private derived(): Pick<SessionView, 'history' | 'shown' | 'fen' | 'dots' | 'controls' | 'returning' | 'note' | 'intro'> {
    const { start, moves } = this.game;
    return {
      history: [...start, ...moves.slice(0, this.ply)],
      shown: start.length + this.viewPly,
      fen: this.positionAt(this.viewPly),
      dots: this.currentDots(),
      controls: this.currentControls(),
      returning: this.viewPly < this.ply || this.practiced,
      note: this.shownNote(),
      intro: this.introducing(),
    };
  }

  private introducing(): boolean {
    return this.firstGame && this.ply === 0;
  }

  /** The note on the position shown: in full while it is new to the user, else only the variation's name. */
  private shownNote(): SessionView['note'] {
    const note = this.noteShown();
    if (!note) return null;
    const full = this.readNotes.has(note.id) || this.isNew(note);
    return { name: note.name, text: full ? note.text : null };
  }

  /** The note on the position after `ply` moves; none where a question, or the moves after its answer, teach instead. */
  private noteAt(ply: number): OpeningNote | null {
    if (this.quietPlies.has(ply) || this.momentAt(ply)) return null;
    const { start, moves } = this.game;
    const lastSan = ply === 0 ? (start.at(-1) ?? null) : moves[ply - 1];
    return this.deps.noteFor(this.positionAt(ply), lastSan);
  }

  private noteShown(): OpeningNote | null {
    return this.introducing() ? null : this.noteAt(this.viewPly);
  }

  private isNew(note: OpeningNote): boolean {
    return !this.readNotes.has(note.id) && this.deps.noteSeenCount(note.id) < FULL_READS;
  }

  /** Counts the note shown as read: the board rests on it, so the user had time to read it. A note autoplay passes is not counted. */
  private readShownNote(): void {
    const note = this.noteShown();
    if (!note || !this.isNew(note)) return;
    this.readNotes.add(note.id);
    this.deps.markNoteSeen(note.id);
  }

  /** Autoplay stops for a plan the user has never seen, a few times a game; or for every new note, if they chose that. */
  private holdsOn(note: OpeningNote | null): boolean {
    if (!note || !this.isNew(note)) return false;
    if (this.deps.stopsAtEveryNote()) return true;
    return note.plan && this.deps.noteSeenCount(note.id) === 0 && this.noteStops < MAX_NOTE_STOPS;
  }

  private currentDots(): DotState[] {
    const { phase } = this.view;
    const upcoming = [...this.moments]
      .sort(([a], [b]) => a - b)
      .filter(([i, type]) => {
        const ply = this.game.turns[i].ply;
        return isPrompted(type) && ply >= this.ply && !this.handledPlies.has(ply);
      })
      .map(([i]): DotState => (phase.kind === 'pause' && phase.turnIndex === i ? 'now' : 'todo'));
    return [...this.doneDots, ...upcoming];
  }

  private currentControls(): Controls {
    const { kind } = this.view.phase;
    if ((kind !== 'ready' && kind !== 'playing') || this.moving) return NO_CONTROLS;
    return {
      back: this.viewPly > 0,
      forward: this.viewPly < this.ply || this.ply < this.steps.length,
      previousKey: this.previousKeyPly() !== null,
    };
  }

  /** The latest answered key position before the one being looked at. */
  private previousKeyPly(): number | null {
    const earlier = [...this.handledPlies].filter((ply) => ply < this.viewPly);
    return earlier.length > 0 ? Math.max(...earlier) : null;
  }

  private positionAt(ply: number): string {
    return ply === 0 ? this.startFen : this.steps[ply - 1].fen;
  }

  private lastUciAt(ply: number): string | null {
    return ply === 0 ? null : this.steps[ply - 1].uci;
  }

  private assertAlive(): void {
    if (this.disposed) throw new Stopped();
  }

  private async until<T>(promise: Promise<T>): Promise<T> {
    const value = await promise;
    this.assertAlive();
    return value;
  }

  /** Loads the game and shows its start; false when a review points at a position that is gone. */
  private async setup(): Promise<boolean> {
    const { opening, level, deps } = this;
    const set = await this.until(deps.loadSet(opening, level));
    if (!set) throw new Error(`No games for ${opening} ${level}`);
    if (this.review && !(await this.until(this.reviewStillThere(this.review)))) {
      this.dropStaleReview(this.review);
      return false;
    }
    const game = await this.until(deps.loadGame(opening, level, this.review?.gameId ?? this.pickGameId(set)));
    this.startGame(game);
    await this.until(this.board.setPosition(this.startFen, false));
    if (this.review) await this.replayBeforeReview(this.review.ply);
    return true;
  }

  /** New content can drop a game or move its key positions; a review saved before then points nowhere. */
  private async reviewStillThere({ gameId, ply }: { gameId: string; ply: number }): Promise<boolean> {
    try {
      const game = await this.deps.loadGame(this.opening, this.level, gameId);
      return game.turns.some((t) => t.ply === ply);
    } catch {
      return false;
    }
  }

  private dropStaleReview({ gameId, ply }: { gameId: string; ply: number }): void {
    this.deps.dropReview(this.opening, this.level, gameId, ply);
    this.finished = true;
    this.update({ phase: { kind: 'done', outcome: STALE_REVIEW }, status: '' });
  }

  private pickGameId(set: SetIndex): string {
    const played = new Set(this.deps.playedGameIds(this.opening, this.level));
    const unplayed = set.games.filter((g) => !played.has(g.id));
    if (unplayed.length > 0) return unplayed[0].id;
    return set.games[Math.floor(this.deps.random() * set.games.length)].id;
  }

  private startGame(game: Game): void {
    const chess = new Chess();
    for (const san of game.start) chess.move(san);
    this.game = game;
    this.startFen = chess.fen();
    this.steps = game.moves.map((san) => ({ uci: playSan(chess, san), fen: chess.fen() }));
    this.ply = 0;
    this.viewPly = 0;
    this.moments = this.chooseMomentsFor(game);
    this.update({ game });
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
    this.ply = this.viewPly = Math.max(0, reviewPly - REPLAY_PLIES);
    await this.until(this.board.setPosition(this.positionAt(this.ply), false));
    this.board.setLastMove(this.lastUciAt(this.ply));
    this.update({ phase: { kind: 'busy' }, status: 'Replaying the last moves…' });
    while (this.ply < reviewPly) {
      await this.until(this.deps.wait(REPLAY_MS));
      await this.playForward();
    }
  }

  private async askNextMoment(): Promise<void> {
    const moment = this.nextMoment();
    if (moment) await this.runPause(moment.turnIndex, moment.type);
  }

  /** The task behind Play and Continue: back to the live position, then on to the next key position. */
  private async resume(): Promise<void> {
    if (!this.isPlaying()) return;
    if (this.viewPly !== this.ply) await this.showPly(this.ply);
    await this.autoplay();
  }

  /** Plays the scripted moves of both sides until a prompted moment, a stop or the end of the game. */
  private async autoplay(): Promise<void> {
    this.streak = 0;
    while (this.isPlaying() && this.ply < this.steps.length) {
      this.assertAlive();
      const moment = this.nextMoment();
      if (moment) {
        await this.runPause(moment.turnIndex, moment.type);
        this.streak = 0;
      } else await this.playPaced();
    }
    if (this.ply >= this.steps.length && !this.finished) this.finish();
    // Stopped by the user or for a note; a step the user asked for counts its own note.
    else if (!this.finished && !this.moving) this.readShownNote();
  }

  /** The key position waiting at the live position, if it has not been answered yet. */
  private nextMoment(): { turnIndex: number; type: PausedType } | null {
    return this.momentAt(this.ply);
  }

  private momentAt(ply: number): { turnIndex: number; type: PausedType } | null {
    const turnIndex = this.game.turns.findIndex((t) => t.ply === ply);
    const type = this.moments.get(turnIndex);
    if (!isPrompted(type) || this.handledPlies.has(ply)) return null;
    return { turnIndex, type };
  }

  private isDue(): boolean {
    return this.nextMoment() !== null || this.ply >= this.steps.length;
  }

  /** Moves the model ahead of the board, which then plays the same move. */
  private async playForward(): Promise<void> {
    const { uci } = this.steps[this.viewPly];
    this.viewPly++;
    this.ply = Math.max(this.ply, this.viewPly);
    this.update();
    await this.until(this.board.playMove(uci));
  }

  /** Shows the position after `ply` moves, sliding the pieces there. */
  private async showPly(ply: number): Promise<void> {
    this.viewPly = ply;
    this.update();
    await this.until(this.board.setPosition(this.positionAt(ply), true));
    this.board.setLastMove(this.lastUciAt(ply));
  }

  /** One move per beat, however long the animation takes: quicker through a long stretch, slower into a stop. */
  private async playPaced(): Promise<void> {
    const holds = this.holdsOn(this.noteAt(this.ply + 1));
    const pace = holds ? null : this.deps.wait(beat(this.streak, this.movesUntilStop()));
    this.streak++;
    await this.until(Promise.all([this.playForward(), pace]));
    // A held note waits for the user rather than a timer: reading speeds differ too much.
    if (holds && this.isPlaying()) {
      this.noteStops++;
      this.update({ phase: { kind: 'ready' }, held: true });
    }
  }

  /** Moves left to play before the next key position or the end of the game, the next one included. */
  private movesUntilStop(): number {
    for (let ply = this.ply + 1; ply < this.steps.length; ply++) if (this.momentAt(ply)) return ply - this.ply;
    return this.steps.length - this.ply;
  }

  private async runPause(turnIndex: number, type: PausedType): Promise<void> {
    const result = await this.askPause(turnIndex, type);
    this.record(this.game.turns[turnIndex], type, result);
    if (this.review) {
      this.finish();
      return;
    }
    this.keepQuiet(this.game.turns[turnIndex].ply, result.resumePly);
    this.update({ phase: { kind: 'playing' } });
    await this.catchUp(result.resumePly);
    // One short beat while the panel settles into the dock, then the game plays on.
    await this.until(this.deps.wait(RESUME_MS));
  }

  /** No note on an answered key position, nor on the moves its panel played on from there. */
  private keepQuiet(from: number, to: number): void {
    for (let ply = from; ply <= Math.max(from, to); ply++) this.quietPlies.add(ply);
  }

  private async askPause(turnIndex: number, type: PausedType, practice = false): Promise<PauseResult> {
    this.update({ phase: { kind: 'pause', turnIndex, type, ...(practice && { practice: true as const }) }, status: '' });
    const result = await new Promise<PauseResult>((resolve) => {
      this.pauseResolver = resolve;
    });
    this.pauseResolver = null;
    this.assertAlive();
    return result;
  }

  /** The sheet leaves the board at the pause position; a sheet that played on is caught up without animation. */
  private async catchUp(resumePly: number): Promise<void> {
    this.ply = this.viewPly = Math.max(this.ply, Math.min(resumePly, this.steps.length));
    this.update();
    if (placement(this.board.fen()) === placement(this.positionAt(this.ply))) return;
    await this.until(this.board.setPosition(this.positionAt(this.ply), false));
    this.board.setLastMove(this.lastUciAt(this.ply));
  }

  /** Asks an answered key position again, then returns the board to the live position and waits there. */
  private async practice(ply: number): Promise<void> {
    const turnIndex = this.game.turns.findIndex((t) => t.ply === ply);
    const type = this.moments.get(turnIndex);
    if (!isPrompted(type)) return;
    await this.showPly(ply);
    const result = await this.askPause(turnIndex, type, true);
    this.record(this.game.turns[turnIndex], type, result, true);
    this.practiced = true;
    this.update({ phase: { kind: 'ready' } });
    await this.showPly(this.ply);
  }

  private record(turn: Turn, type: MomentResult['type'], { outcomes, hinted }: PauseResult, practice = false): void {
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
    if (this.review || practice) result.review = true;
    if (practice) result.practice = true;
    if (hinted) result.hinted = true;
    const { depthChanged } = this.deps.recordMoment(result);
    if (!practice) this.countAnswer(turn, result);
    this.update({ depth: depthChanged ?? this.view.depth });
    if (depthChanged) {
      this.deps.celebrate('levelup');
      this.deps.toast('New stage unlocked');
    }
  }

  /** Only a first answer counts toward the game's key positions and dots. */
  private countAnswer(turn: Turn, result: MomentResult): void {
    this.results.push(result);
    this.handledPlies.add(turn.ply);
    this.doneDots.push(result.outcomes.length > 0 && result.outcomes.every((o) => o.correct) ? 'good' : 'bad');
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
    // A review replays one position of a game already played: it is not another game.
    if (!this.review) this.deps.recordGame(summary);
    const outcome = this.review ? 'That was the position you missed before.' : outcomeText(new Chess(this.positionAt(this.ply)), this.game);
    this.update({ phase: { kind: 'done', outcome }, status: '' });
  }
}
