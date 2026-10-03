import { Chess } from 'chess.js';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { BoardController } from '../board/types';
import type { Depth, Game, MomentType, SetIndex, Side, StepOutcome, Turn } from '../content/types';
import { fixtureGame, fixtureSet } from './fixtures';
import { chooseMoments } from './pauses';
import { parseUci } from './position';
import { AUTOPLAY_MS, GameSession, type SessionDeps } from './session';

vi.mock('./pauses', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./pauses')>();
  return { ...actual, chooseMoments: vi.fn(actual.chooseMoments) };
});
const realChooseMoments = (await vi.importActual<typeof import('./pauses')>('./pauses')).chooseMoments;

const GAME_1 = 'italian-1400-0001';
const GAME_2 = 'italian-1400-0002';
const flush = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

class FakeBoard implements BoardController {
  chess = new Chess();
  calls: string[] = [];
  lastMove: string | null = null;

  async setPosition(fen: string, animate = false) {
    this.chess = new Chess(fen);
    this.calls.push(`set:${animate}`);
  }
  async playMove(uci: string) {
    this.chess.move(parseUci(uci));
    this.calls.push(`play:${uci}`);
  }
  fen() {
    return this.chess.fen();
  }
  highlight() {}
  clearHighlights() {}
  setLastMove(uci: string | null) {
    this.lastMove = uci;
  }
  enableMoves(_side: Side) {}
  enableSquareTaps() {}
  disableInput() {}
  squareCenter(square: string) {
    return { x: square.charCodeAt(0), y: Number(square[1]) };
  }
  dim() {}
  badge() {}
  arrow() {}
  clearArrows() {}
  burst() {}
  onMoved() {
    return () => {};
  }
  evalBar() {}
}

function makeGame(id: string, moves: string[], extra: Partial<Game> = {}): Game {
  const base = { ...fixtureGame(GAME_1), ...extra };
  const chess = new Chess();
  base.start.forEach((san) => chess.move(san));
  const turns: Turn[] = [];
  moves.forEach((san, ply) => {
    if (chess.turn() === base.side) {
      turns.push({ ...fixtureGame(GAME_1).turns[0], ply, moveNo: Math.floor(ply / 2) + 4, fen: chess.fen(), grades: {}, refutations: {} });
    }
    chess.move(san);
  });
  return { ...base, id, moves, turns };
}

function setIndexOf(games: Game[], side: Side = 'w'): SetIndex {
  return { ...fixtureSet, side, start: games[0].start, games: games.map((g) => ({ id: g.id, moves: g.moves })) };
}

function startSession(options: { games?: Game[]; review?: { gameId: string; ply: number }; played?: string[]; depth?: Depth; noSet?: boolean } = {}) {
  const games = options.games ?? [fixtureGame(GAME_1), fixtureGame(GAME_2)];
  const board = new FakeBoard();
  const deps = {
    board,
    loadSet: vi.fn(async () => (options.noSet ? null : setIndexOf(games, games[0].side))),
    loadGame: vi.fn(async (_o: string, _l: number, id: string) => structuredClone(games.find((g) => g.id === id)!)),
    getDepth: vi.fn(() => options.depth ?? (1 as Depth)),
    isQuick: vi.fn(() => false),
    playedGameIds: vi.fn(() => options.played ?? []),
    recordMoment: vi.fn<SessionDeps['recordMoment']>(() => ({})),
    recordGame: vi.fn<SessionDeps['recordGame']>(),
    celebrate: vi.fn(),
    toast: vi.fn(),
    wait: vi.fn<SessionDeps['wait']>(async () => {}),
    random: vi.fn(() => 0.5),
    now: vi.fn(() => 1234),
  };
  const session = new GameSession(games[0].opening, games[0].level, options.review, deps);
  void session.start();
  return { session, board, deps };
}

type Started = ReturnType<typeof startSession>;

/** Moments keyed by ply instead of by turn index. */
function momentsAt(byPly: Record<number, MomentType>) {
  vi.mocked(chooseMoments).mockImplementation((turns) => {
    return new Map(Object.entries(byPly).flatMap(([ply, type]) => {
      const index = turns.findIndex((t) => t.ply === Number(ply));
      return index < 0 ? [] : [[index, type] as [number, MomentType]];
    }));
  });
}

async function waitForPhase(started: Started, kind: string): Promise<void> {
  for (let guard = 0; guard < 100; guard++) {
    await flush();
    if (started.session.getView().phase.kind === kind) return;
  }
  throw new Error(`Never reached phase ${kind}, stuck in ${started.session.getView().phase.kind}`);
}

/** Makes every autoplay beat wait for the returned function, which lets the moves in flight finish. */
function gateBeats({ deps }: Started): () => Promise<void> {
  const pending: (() => void)[] = [];
  deps.wait.mockImplementation(() => new Promise<void>((resolve) => pending.push(resolve)));
  return async () => {
    pending.splice(0).forEach((release) => release());
    await flush();
  };
}

/** Starts the game and plays to its first prompted moment. */
async function playToPause(options: Parameters<typeof startSession>[0] = {}): Promise<Started> {
  const started = startSession(options);
  await flush();
  started.session.play();
  await waitForPhase(started, 'pause');
  return started;
}

const movesPlayed = ({ session }: Started) => session.getView().history.length - session.getView().game!.start.length;

const outcomes = (...correct: boolean[]): StepOutcome[] =>
  correct.map((c, i) => ({ step: (['spot', 'find', 'solve', 'hold'] as const)[i], correct: c }));

async function startReady(options: Parameters<typeof startSession>[0] = {}): Promise<Started> {
  const started = startSession(options);
  await flush();
  return started;
}

/** Steps forward `times` moves, one tap each. */
async function stepForward({ session }: Started, times = 1): Promise<void> {
  for (let i = 0; i < times; i++) {
    session.stepForward();
    await flush();
  }
}

async function stepBack({ session }: Started, times = 1): Promise<void> {
  for (let i = 0; i < times; i++) {
    session.stepBack();
    await flush();
  }
}

/** How many scripted moves the board shows. */
const shownPly = ({ session }: Started) => session.getView().shown - session.getView().game!.start.length;

const positionAfter = (game: Game, plies: number): string => {
  const chess = new Chess();
  [...game.start, ...game.moves.slice(0, plies)].forEach((san) => chess.move(san));
  return chess.fen();
};

/** Lets gated autoplay run until a key position opens. */
async function beatsUntilPause(started: Started, beat: () => Promise<void>): Promise<void> {
  for (let guard = 0; guard < 50 && started.session.getView().phase.kind !== 'pause'; guard++) await beat();
}

/** Answers the open key position and, with the beats gated, stops autoplay `moves` moves later. */
async function answerAndStopAfter(started: Started, beat: () => Promise<void>, resumePly: number, moves: number): Promise<void> {
  started.session.pauseDone({ outcomes: outcomes(true, false), resumePly });
  await flush();
  for (let i = 1; i < moves; i++) await beat();
  started.session.pausePlayback();
  await beat();
}

beforeEach(() => {
  vi.mocked(chooseMoments).mockReset();
  vi.mocked(chooseMoments).mockImplementation(() => new Map());
});

describe('starting a game', () => {
  it('shows the opening position and waits for play', async () => {
    const { session, board, deps } = startSession();
    await flush();
    expect(board.calls).toEqual(['set:false']);
    expect(deps.loadGame).toHaveBeenCalledWith('italian', 1400, GAME_1);
    expect(deps.wait).not.toHaveBeenCalled();
    expect(session.getView().phase).toEqual({ kind: 'ready' });
    expect(session.getView().history).toEqual(['e4', 'e5', 'Nf3', 'Nc6', 'Bc4']);
  });

  it('picks the first unplayed game, else a random one', async () => {
    const first = startSession({ played: [GAME_1] });
    await flush();
    expect(first.deps.loadGame).toHaveBeenCalledWith('italian', 1400, GAME_2);

    const random = startSession({ played: [GAME_1, GAME_2] });
    random.deps.random.mockReturnValue(0.2);
    await flush();
    expect(random.deps.loadGame).toHaveBeenCalledWith('italian', 1400, GAME_1);
  });

  it('reports a set with no games', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const started = startSession({ noSet: true });
    await flush();
    expect(started.session.getView().phase.kind).toBe('error');
    expect(started.board.calls).toEqual([]);
  });

  it('chooses moments for the depth and quick setting, with no silent checks and a seed from the game id', async () => {
    startSession({ depth: 4 });
    await flush();
    const [turns, depth, options] = vi.mocked(chooseMoments).mock.calls[0];
    expect(turns).toHaveLength(fixtureGame(GAME_1).turns.length);
    expect(depth).toBe(4);
    expect(options?.quick).toBe(false);
    expect(options?.silent).toBe(false);
    expect(typeof options?.seed).toBe('number');
  });
});

describe('autoplay', () => {
  it('plays both sides up to the first key position, one beat per move', async () => {
    momentsAt({ 3: 'pause' });
    const { session, board, deps } = await playToPause();
    expect(board.calls).toEqual(['set:false', 'play:g8f6', 'play:d2d4', 'play:f6e4']);
    expect(session.getView().history.slice(-3)).toEqual(['Nf6', 'd4', 'Nxe4']);
    expect(deps.wait).toHaveBeenCalledTimes(3);
    expect(deps.wait.mock.calls.every(([ms]) => ms === AUTOPLAY_MS)).toBe(true);
    expect(AUTOPLAY_MS).toBe(600);
  });

  it('does not move until the next beat', async () => {
    momentsAt({ 3: 'pause' });
    const started = startSession();
    await flush();
    const beat = gateBeats(started);
    started.session.play();
    await flush();
    expect(started.session.getView().phase).toEqual({ kind: 'playing' });
    expect(movesPlayed(started)).toBe(1);
    await beat();
    expect(movesPlayed(started)).toBe(2);
    await beat();
    await beat();
    expect(started.session.getView().phase.kind).toBe('pause');
  });

  it('plays turns without a moment, or inside a play-out, like any other move', async () => {
    momentsAt({ 1: 'playout', 3: 'playout' });
    const started = startSession();
    await flush();
    started.session.play();
    await flush();
    expect(started.session.getView().phase.kind).toBe('done');
    expect(started.session.getView().history).toHaveLength(5 + fixtureGame(GAME_1).moves.length);
    expect(started.deps.recordMoment).not.toHaveBeenCalled();
  });

  it('keeps the view in step with the board', async () => {
    momentsAt({ 3: 'pause' });
    const started = await playToPause();
    expect(started.session.getView().fen).toBe(started.board.fen());
    expect(started.session.getView().game?.id).toBe(GAME_1);
  });

  it('ignores play while it is already playing', async () => {
    const started = startSession();
    await flush();
    const beat = gateBeats(started);
    started.session.play();
    started.session.play();
    await flush();
    expect(movesPlayed(started)).toBe(1);
    await beat();
    expect(movesPlayed(started)).toBe(2);
  });

  describe('pausing playback', () => {
    it('stops after the move being played and plays on from there', async () => {
      const started = startSession();
      await flush();
      const beat = gateBeats(started);
      started.session.play();
      await flush();
      await beat();
      expect(movesPlayed(started)).toBe(2);

      started.session.pausePlayback();
      expect(started.session.getView().phase).toEqual({ kind: 'ready' });
      await beat();
      await beat();
      expect(movesPlayed(started)).toBe(2);

      started.session.play();
      await flush();
      expect(started.session.getView().phase).toEqual({ kind: 'playing' });
      expect(movesPlayed(started)).toBe(3);
    });

    it('keeps one loop when play is tapped before the last move has finished', async () => {
      const started = startSession();
      await flush();
      const beat = gateBeats(started);
      started.session.play();
      await flush();
      started.session.pausePlayback();
      started.session.play();
      await beat();
      expect(movesPlayed(started)).toBe(2);
      await beat();
      expect(movesPlayed(started)).toBe(3);
    });

    it('opens the key position it stopped on when play is tapped again', async () => {
      momentsAt({ 3: 'pause' });
      const started = startSession();
      await flush();
      const beat = gateBeats(started);
      started.session.play();
      await flush();
      await beat();
      await beat();
      expect(started.session.getView().history.at(-1)).toBe('Nxe4');

      started.session.pausePlayback();
      await beat();
      expect(started.session.getView().phase.kind).toBe('ready');
      started.session.play();
      await flush();
      expect(started.session.getView().phase).toEqual({ kind: 'pause', turnIndex: 1, type: 'pause' });
    });

    it('does nothing when playback is not running', async () => {
      const started = startSession();
      await flush();
      started.session.pausePlayback();
      expect(started.session.getView().phase).toEqual({ kind: 'ready' });
    });
  });
});

describe('a pause', () => {
  it('waits for the pause sheet and records the moment', async () => {
    momentsAt({ 3: 'pause' });
    const started = await playToPause({ depth: 3 });
    expect(started.session.getView().phase).toEqual({ kind: 'pause', turnIndex: 1, type: 'pause' });
    const callsAtPause = started.board.calls.length;
    await flush();
    expect(started.board.calls).toHaveLength(callsAtPause);

    started.session.pauseDone({ outcomes: outcomes(true, true, false), resumePly: 3 });
    await flush();
    expect(started.deps.recordMoment).toHaveBeenCalledWith({
      opening: 'italian',
      level: 1400,
      gameId: GAME_1,
      ply: 3,
      moveNo: 5,
      type: 'pause',
      kinds: fixtureGame(GAME_1).turns[1].kinds,
      depth: 3,
      outcomes: outcomes(true, true, false),
      stars: 2,
      at: 1234,
    });
  });

  it('plays on by itself, starting with the scripted move', async () => {
    momentsAt({ 3: 'pause' });
    const started = await playToPause();
    const beat = gateBeats(started);
    started.session.pauseDone({ outcomes: outcomes(true), resumePly: 3 });
    await flush();
    expect(started.session.getView().phase).toEqual({ kind: 'playing' });
    expect(started.board.calls.at(-1)).toBe('play:d4e5');
    await beat();
    expect(started.board.calls.at(-1)).toBe('play:d7d6');
    expect(started.session.getView().history.slice(-3)).toEqual(['Nxe4', 'dxe5', 'd6']);
  });

  it('leaves a board that is already in step alone', async () => {
    momentsAt({ 3: 'pause' });
    const started = await playToPause();
    started.session.pauseDone({ outcomes: outcomes(true), resumePly: 3 });
    await flush();
    expect(started.board.calls.filter((call) => call.startsWith('set'))).toEqual(['set:false']);
  });

  it('catches the model up without animation when the sheet reports a play-out', async () => {
    momentsAt({ 3: 'pause' });
    const started = await playToPause({ depth: 4 });
    const beat = gateBeats(started);
    started.session.pauseDone({ outcomes: outcomes(true), resumePly: 6 });
    await flush();
    expect(started.board.calls.slice(-2)).toEqual(['set:false', 'play:d6e5']);
    const model = new Chess();
    started.session.getView().history.forEach((san) => model.move(san));
    expect(started.board.fen()).toBe(model.fen());
    expect(started.session.getView().history.slice(-4)).toEqual(['dxe5', 'd6', 'O-O', 'dxe5']);
    await beat();
  });

  it('puts a board that is out of step back on the model position', async () => {
    momentsAt({ 3: 'pause' });
    const started = await playToPause();
    await started.board.playMove('d4e5');
    started.board.calls.length = 0;
    started.session.pauseDone({ outcomes: outcomes(true), resumePly: 3 });
    await flush();
    expect(started.board.calls.slice(0, 2)).toEqual(['set:false', 'play:d4e5']);
  });

  it('asks a nothing pause as such', async () => {
    momentsAt({ 23: 'nothing' });
    const started = await playToPause();
    expect(started.session.getView().phase).toEqual({ kind: 'pause', turnIndex: 11, type: 'nothing' });
  });

  it('celebrates a level-up when the depth changes', async () => {
    momentsAt({ 3: 'pause' });
    const started = await playToPause({ depth: 1 });
    started.deps.recordMoment.mockReturnValue({ depthChanged: 2 });
    started.session.pauseDone({ outcomes: outcomes(true), resumePly: 3 });
    await flush();
    expect(started.deps.celebrate).toHaveBeenCalledWith('levelup');
    expect(started.deps.toast).toHaveBeenCalledWith('New stage unlocked');
    expect(started.session.getView().depth).toBe(2);
  });

  it('fills the progress dots as pauses are found or missed', async () => {
    momentsAt({ 3: 'pause', 7: 'nothing' });
    const started = startSession();
    await flush();
    expect(started.session.getView().dots).toEqual(['todo', 'todo']);
    started.session.play();
    await waitForPhase(started, 'pause');
    expect(started.session.getView().dots).toEqual(['now', 'todo']);

    started.session.pauseDone({ outcomes: outcomes(true, false), resumePly: 3 });
    await waitForPhase(started, 'pause');
    expect(started.session.getView().dots).toEqual(['bad', 'now']);
    started.session.pauseDone({ outcomes: outcomes(true, true), resumePly: 7 });
    await flush();
    expect(started.session.getView().dots).toEqual(['bad', 'good']);
  });
});

describe('stepping through the moves', () => {
  const game = () => fixtureGame(GAME_1);

  it('steps back one move at a time, sliding the pieces back, down to the start', async () => {
    const started = await startReady();
    await stepForward(started, 3);
    const { session, board } = started;

    await stepBack(started);
    expect(board.calls.at(-1)).toBe('set:true');
    expect(board.fen()).toBe(positionAfter(game(), 2));
    expect(board.lastMove).toBe('d2d4');
    expect(shownPly(started)).toBe(2);
    expect(session.getView().fen).toBe(board.fen());
    expect(session.getView().history).toHaveLength(8);
    expect(session.getView().controls.back).toBe(true);

    await stepBack(started, 2);
    expect(board.fen()).toBe(positionAfter(game(), 0));
    expect(board.lastMove).toBeNull();
    expect(session.getView().controls.back).toBe(false);

    const callsBefore = board.calls.length;
    await stepBack(started);
    expect(board.calls).toHaveLength(callsBefore);
  });

  it('steps forward again through the moves already played, animating each', async () => {
    const started = await startReady();
    await stepForward(started, 3);
    await stepBack(started, 2);

    await stepForward(started);
    expect(started.board.calls.at(-1)).toBe('play:d2d4');
    expect(shownPly(started)).toBe(2);
    expect(started.board.fen()).toBe(positionAfter(game(), 2));
    expect(started.session.getView().history).toHaveLength(8);
  });

  it('plays the next scripted move by hand once the board is back at the live position', async () => {
    const started = await startReady();
    await stepForward(started, 2);
    await stepBack(started);
    await stepForward(started);
    expect(started.session.getView().returning).toBe(false);

    await stepForward(started);
    expect(started.board.calls.at(-1)).toBe('play:f6e4');
    expect(started.session.getView().history.at(-1)).toBe('Nxe4');
    expect(shownPly(started)).toBe(3);
    expect(started.session.getView().phase).toEqual({ kind: 'ready' });
    expect(started.deps.wait).not.toHaveBeenCalled();
  });

  it('opens a key position the next move reaches, then plays on once it is answered', async () => {
    momentsAt({ 3: 'pause' });
    const started = await startReady();
    await stepForward(started, 3);
    expect(started.session.getView().phase).toEqual({ kind: 'pause', turnIndex: 1, type: 'pause' });

    const beat = gateBeats(started);
    started.session.pauseDone({ outcomes: outcomes(true), resumePly: 3 });
    await flush();
    expect(started.board.calls.at(-1)).toBe('play:d4e5');
    expect(started.session.getView().phase).toEqual({ kind: 'playing' });
    expect(started.session.getView().controls.back).toBe(true);
    await beat();
    expect(started.session.getView().history.at(-1)).toBe('d6');
  });

  it('opens an unanswered key position it is standing on instead of skipping it', async () => {
    momentsAt({ 3: 'pause' });
    const started = await startReady();
    const beat = gateBeats(started);
    started.session.play();
    await flush();
    await beat();
    await beat();
    started.session.pausePlayback();
    await beat();
    expect(started.session.getView().phase.kind).toBe('ready');

    started.session.stepForward();
    await flush();
    expect(started.session.getView().phase).toEqual({ kind: 'pause', turnIndex: 1, type: 'pause' });
    expect(started.session.getView().history.at(-1)).toBe('Nxe4');
  });

  it('stops autoplay first when a step is tapped while it runs', async () => {
    const started = await startReady();
    const beat = gateBeats(started);
    started.session.play();
    await flush();
    started.session.stepBack();
    expect(started.session.getView().phase).toEqual({ kind: 'ready' });
    expect(started.session.getView().controls).toEqual({ back: false, forward: false, previousKey: false });

    await beat();
    await beat();
    expect(movesPlayed(started)).toBe(1);
    expect(shownPly(started)).toBe(0);
    expect(started.board.calls.at(-1)).toBe('set:true');
    expect(started.session.getView().controls.forward).toBe(true);
  });

  it('turns the step buttons off while a move is sliding and ignores taps meanwhile', async () => {
    const started = await startReady();
    let finish!: () => void;
    const playMove = started.board.playMove.bind(started.board);
    started.board.playMove = (uci) => new Promise((resolve) => (finish = () => resolve(playMove(uci))));

    started.session.stepForward();
    started.session.stepForward();
    await flush();
    expect(started.session.getView().controls).toEqual({ back: false, forward: false, previousKey: false });
    expect(movesPlayed(started)).toBe(1);

    finish();
    await flush();
    expect(movesPlayed(started)).toBe(1);
    expect(started.session.getView().controls.forward).toBe(true);
  });

  it('plays nothing by hand after dispose', async () => {
    const started = await startReady();
    started.session.dispose();
    started.session.stepForward();
    await flush();
    expect(started.board.calls).toEqual(['set:false']);
  });
});

describe('continuing from an earlier move', () => {
  it('goes back to the live position, then plays on by itself', async () => {
    momentsAt({ 7: 'pause' });
    const started = await startReady();
    await stepForward(started, 3);
    await stepBack(started, 2);
    expect(started.session.getView().returning).toBe(true);

    const beat = gateBeats(started);
    started.session.play();
    await flush();
    expect(started.board.calls.slice(-2)).toEqual(['set:true', 'play:d4e5']);
    expect(shownPly(started)).toBe(4);
    expect(started.session.getView().returning).toBe(false);
    for (let i = 0; i < 4; i++) await beat();
    expect(started.session.getView().phase.kind).toBe('pause');
  });

  it('does not go back to the live position when playback was stopped before it left', async () => {
    const started = await startReady();
    await stepForward(started, 2);
    const beat = gateBeats(started);
    started.session.play();
    started.session.pausePlayback();
    await beat();
    expect(started.board.calls.filter((call) => call === 'set:true')).toHaveLength(0);
  });
});

describe('a key position tried again', () => {
  const FINAL = ['Nf6', 'd4', 'Nxe4', 'dxe5', 'd6', 'O-O'];

  /** Reaches the pause at ply 3, answers it, and stops autoplay with `ahead` more moves played. */
  async function afterFirstAnswer(ahead: number, options: Parameters<typeof startSession>[0] = {}) {
    const started = await startReady(options);
    const beat = gateBeats(started);
    started.session.play();
    await flush();
    await beatsUntilPause(started, beat);
    await answerAndStopAfter(started, beat, 3, ahead);
    return { started, beat };
  }

  it('is not offered before a key position has been answered', async () => {
    momentsAt({ 3: 'pause' });
    const started = await startReady();
    expect(started.session.getView().controls.previousKey).toBe(false);
    const beat = gateBeats(started);
    started.session.play();
    await beatsUntilPause(started, beat);
    started.session.pauseDone({ outcomes: outcomes(true), resumePly: 3 });
    await flush();
    expect(started.session.getView().controls.previousKey).toBe(true);
  });

  it('returns to the latest key position before this point and asks it again', async () => {
    momentsAt({ 3: 'pause' });
    const { started } = await afterFirstAnswer(2);
    expect(started.session.getView().history.at(-1)).toBe('d6');

    started.session.previousKeyPosition();
    await flush();
    expect(started.session.getView().phase).toEqual({ kind: 'pause', turnIndex: 1, type: 'pause', practice: true });
    expect(started.board.fen()).toBe(positionAfter(fixtureGame(GAME_1), 3));
    expect(started.board.calls.at(-1)).toBe('set:true');
    expect(started.session.getView().controls.previousKey).toBe(false);
  });

  it('records the answer as practice without touching the game, the dots or the summary', async () => {
    momentsAt({ 3: 'pause' });
    const game = makeGame('short', FINAL);
    const { started, beat } = await afterFirstAnswer(2, { games: [game] });
    expect(started.session.getView().dots).toEqual(['bad']);

    started.session.previousKeyPosition();
    await flush();
    started.session.pauseDone({ outcomes: outcomes(true, true), resumePly: 3 });
    await flush();
    expect(started.deps.recordMoment).toHaveBeenLastCalledWith(expect.objectContaining({ ply: 3, review: true, stars: 2 }));
    expect(started.session.getView().dots).toEqual(['bad']);
    expect(started.deps.recordGame).not.toHaveBeenCalled();

    started.session.play();
    await flush();
    for (let i = 0; i < 3; i++) await beat();
    expect(started.session.getView().phase.kind).toBe('done');
    const { moments } = started.deps.recordGame.mock.calls[0][0];
    expect(moments).toHaveLength(1);
    expect(moments[0].review).toBeUndefined();
    expect(started.deps.recordMoment.mock.calls.map(([m]) => m.review)).toEqual([undefined, true]);
  });

  it('puts the board back on the live position afterwards and waits for Continue', async () => {
    momentsAt({ 3: 'pause' });
    const { started } = await afterFirstAnswer(2);
    const live = started.board.fen();
    const waits = started.deps.wait.mock.calls.length;

    started.session.previousKeyPosition();
    await flush();
    started.session.pauseDone({ outcomes: outcomes(true, true), resumePly: 3 });
    await flush();
    const view = started.session.getView();
    expect(view.phase).toEqual({ kind: 'ready' });
    expect(started.board.fen()).toBe(live);
    expect(shownPly(started)).toBe(view.history.length - view.game!.start.length);
    expect(view.returning).toBe(true);
    expect(started.deps.wait).toHaveBeenCalledTimes(waits);

    const movesBefore = movesPlayed(started);
    started.session.play();
    await flush();
    expect(movesPlayed(started)).toBe(movesBefore + 1);
    expect(started.session.getView().returning).toBe(false);
  });

  it('goes to the key position before when it is tapped again from a key position', async () => {
    momentsAt({ 3: 'pause', 7: 'nothing' });
    const started = await startReady();
    const beat = gateBeats(started);
    started.session.play();
    await beatsUntilPause(started, beat);
    started.session.pauseDone({ outcomes: outcomes(true), resumePly: 3 });
    await flush();
    await beatsUntilPause(started, beat);
    expect(started.session.getView().phase).toEqual({ kind: 'pause', turnIndex: 3, type: 'nothing' });
    await answerAndStopAfter(started, beat, 7, 1);
    expect(shownPly(started)).toBe(8);

    await stepBack(started);
    expect(shownPly(started)).toBe(7);
    started.session.previousKeyPosition();
    await flush();
    expect(started.session.getView().phase).toEqual({ kind: 'pause', turnIndex: 1, type: 'pause', practice: true });
  });

  it('can be asked again and again', async () => {
    momentsAt({ 3: 'pause' });
    const { started } = await afterFirstAnswer(2);
    for (let i = 0; i < 2; i++) {
      started.session.previousKeyPosition();
      await flush();
      expect(started.session.getView().phase.kind).toBe('pause');
      started.session.pauseDone({ outcomes: outcomes(false), resumePly: 3 });
      await flush();
      expect(started.session.getView().phase).toEqual({ kind: 'ready' });
    }
    expect(started.deps.recordMoment).toHaveBeenCalledTimes(3);
  });

  it('does nothing when there is no earlier key position', async () => {
    const started = await startReady();
    await stepForward(started, 2);
    const callsBefore = started.board.calls.length;
    started.session.previousKeyPosition();
    await flush();
    expect(started.board.calls).toHaveLength(callsBefore);
    expect(started.session.getView().phase.kind).toBe('ready');
  });
});

describe('the end of a game', () => {
  it('records the summary and waits for Finish after the last move', async () => {
    momentsAt({ 3: 'pause' });
    const game = makeGame('short', ['Nf6', 'd4', 'Nxe4', 'dxe5']);
    const started = await playToPause({ games: [game] });
    started.session.pauseDone({ outcomes: outcomes(true), resumePly: 3 });
    await flush();
    expect(started.board.calls.at(-1)).toBe('play:d4e5');
    expect(started.deps.recordGame).toHaveBeenCalledTimes(1);
    const summary = started.deps.recordGame.mock.calls[0][0];
    expect(summary).toMatchObject({ opening: 'italian', level: 1400, gameId: 'short', at: 1234 });
    expect(summary.moments).toHaveLength(1);
    expect(started.session.getView().phase).toEqual({ kind: 'done', outcome: expect.stringMatching(/^That is the end of this game\./) });
  });

  it('ends after a game with no key position has played out', async () => {
    const started = startSession({ games: [makeGame('short', ['Nf6', 'd4'])] });
    await flush();
    started.session.play();
    await flush();
    expect(started.deps.recordGame).toHaveBeenCalledWith(expect.objectContaining({ gameId: 'short', moments: [] }));
    expect(started.session.getView().phase.kind).toBe('done');
  });

  it('does not end a game that is only paused', async () => {
    const started = startSession();
    await flush();
    const beat = gateBeats(started);
    started.session.play();
    await flush();
    started.session.pausePlayback();
    await beat();
    expect(started.deps.recordGame).not.toHaveBeenCalled();
    expect(started.session.getView().phase.kind).not.toBe('done');
  });
});

describe('reviewing a moment', () => {
  it('jumps to four plies before, replays them, then pauses with no button', async () => {
    const started = startSession({ review: { gameId: GAME_1, ply: 7 } });
    await waitForPhase(started, 'pause');
    const { board, deps, session } = started;
    expect(board.calls).toEqual(['set:false', 'set:false', 'play:d4e5', 'play:d7d6', 'play:e1g1', 'play:d6e5']);
    expect(deps.wait).toHaveBeenCalledTimes(4);
    expect(deps.wait.mock.calls.every(([ms]) => ms === 250)).toBe(true);
    expect(session.getView().phase).toEqual({ kind: 'pause', turnIndex: 3, type: 'pause' });
    expect(session.getView().history.at(-1)).toBe('dxe5');
  });

  it('is busy, not ready to play, while it replays', async () => {
    const started = startSession({ review: { gameId: GAME_1, ply: 7 } });
    const beat = gateBeats(started);
    await flush();
    expect(started.session.getView().phase).toEqual({ kind: 'busy' });
    expect(started.session.getView().status).toBe('Replaying the last moves…');
    started.session.play();
    expect(started.session.getView().phase).toEqual({ kind: 'busy' });
    await beat();
    expect(started.board.calls.filter((call) => call.startsWith('play'))).toHaveLength(1);
  });

  it('is a nothing pause when the moment was one', async () => {
    const started = startSession({ review: { gameId: GAME_1, ply: 23 } });
    await waitForPhase(started, 'pause');
    expect(started.session.getView().phase).toEqual({ kind: 'pause', turnIndex: 11, type: 'nothing' });
  });

  it('ends the review after the pause with a one-moment summary', async () => {
    const started = startSession({ review: { gameId: GAME_1, ply: 7 } });
    await waitForPhase(started, 'pause');
    const playsBefore = started.board.calls.length;
    started.session.pauseDone({ outcomes: outcomes(true, true, true), resumePly: 7 });
    await flush();
    expect(started.deps.recordMoment).toHaveBeenCalledWith(expect.objectContaining({ ply: 7, review: true, stars: 3 }));
    const summary = started.deps.recordGame.mock.calls[0][0];
    expect(summary.moments).toHaveLength(1);
    expect(summary.moments[0].review).toBe(true);
    expect(started.session.getView().phase.kind).toBe('done');
    expect(started.board.calls).toHaveLength(playsBefore);
  });

  it('replays from the start when the moment is early in the game', async () => {
    const started = startSession({ review: { gameId: GAME_1, ply: 3 } });
    await waitForPhase(started, 'pause');
    expect(started.deps.wait).toHaveBeenCalledTimes(3);
  });

  it('reports a ply that is not a turn', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const started = startSession({ review: { gameId: GAME_1, ply: 4 } });
    await flush();
    expect(started.session.getView().phase.kind).toBe('error');
  });
});

describe('leaving the screen', () => {
  it('stops playing after the move in flight', async () => {
    const started = startSession();
    await flush();
    const beat = gateBeats(started);
    started.session.play();
    await flush();
    started.session.dispose();
    const callsBefore = started.board.calls.length;
    await beat();
    await beat();
    expect(started.board.calls).toHaveLength(callsBefore);
  });

  it('plays nothing when play arrives after dispose', async () => {
    const started = startSession();
    await flush();
    started.session.dispose();
    started.session.play();
    await flush();
    expect(started.board.calls).toEqual(['set:false']);
  });

  it('does not record or resume a pause answered after dispose', async () => {
    momentsAt({ 3: 'pause' });
    const started = await playToPause();
    started.session.dispose();
    const callsBefore = started.board.calls.length;
    started.session.pauseDone({ outcomes: outcomes(true), resumePly: 3 });
    await flush();
    expect(started.deps.recordMoment).not.toHaveBeenCalled();
    expect(started.board.calls).toHaveLength(callsBefore);
  });

  it('does not start a review replay after dispose', async () => {
    const started = startSession({ review: { gameId: GAME_1, ply: 7 } });
    const beat = gateBeats(started);
    await flush();
    started.session.dispose();
    await beat();
    await beat();
    expect(started.board.calls.filter((call) => call.startsWith('play'))).toHaveLength(0);
  });
});

describe('with the real moment selection', () => {
  it.each([GAME_1, GAME_2])('reaches every key position of %s, pauses on each and finishes the game', async (id) => {
    vi.mocked(chooseMoments).mockImplementation(realChooseMoments);
    const started = startSession({ played: id === GAME_2 ? [GAME_1] : [] });
    await flush();
    const keyPositions = started.session.getView().dots.length;
    expect(keyPositions).toBeGreaterThan(0);

    for (let guard = 0; guard < 50 && started.session.getView().phase.kind !== 'done'; guard++) {
      const { session } = started;
      const { phase, game } = session.getView();
      if (phase.kind === 'ready') session.play();
      if (phase.kind === 'pause') session.pauseDone({ outcomes: outcomes(true), resumePly: game!.turns[phase.turnIndex].ply });
      await flush();
    }

    expect(started.session.getView().phase.kind).toBe('done');
    const { moments } = started.deps.recordGame.mock.calls[0][0];
    expect(moments).toHaveLength(keyPositions);
    expect(moments.every((m) => m.type === 'pause' || m.type === 'nothing')).toBe(true);
    expect(started.session.getView().history).toHaveLength(5 + fixtureGame(id).moves.length);
  });
});
