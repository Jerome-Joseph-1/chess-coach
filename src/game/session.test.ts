import { Chess } from 'chess.js';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { BoardController, Tone } from '../board/types';
import type { Depth, Game, MomentType, SetIndex, Side, StepOutcome, Turn } from '../content/types';
import { fixtureGame, fixtureSet } from './fixtures';
import { chooseMoments } from './pauses';
import { parseUci, sanToUci } from './position';
import { GameSession, type SessionDeps } from './session';

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
  handler: ((uci: string) => boolean | Promise<boolean>) | null = null;
  highlights: [string[], Tone][] = [];
  dimmed: string[] | null = null;

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
  highlight(squares: string[], tone: Tone) {
    this.highlights.push([squares, tone]);
  }
  clearHighlights() {
    this.highlights = [];
  }
  setLastMove(uci: string | null) {
    this.lastMove = uci;
  }
  enableMoves(_side: Side, onMove: (uci: string) => boolean | Promise<boolean>) {
    this.handler = onMove;
  }
  enableSquareTaps() {}
  disableInput() {
    this.handler = null;
  }
  squareCenter(square: string) {
    return { x: square.charCodeAt(0), y: Number(square[1]) };
  }
  dim(except: string[] | null) {
    this.dimmed = except;
  }
  badge() {}
  arrow() {}
  clearArrows() {}

  /** The user moves a piece; like the real board, an unwanted move is not kept. */
  userMove(uci: string): boolean {
    if (!this.handler) throw new Error('Input is not enabled');
    this.chess.move(parseUci(uci));
    const keep = this.handler(uci) as boolean;
    if (!keep) this.chess.undo();
    return keep;
  }
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
    recordMoment: vi.fn((): { depthChanged?: Depth } => ({})),
    recordGame: vi.fn<SessionDeps['recordGame']>(),
    celebrate: vi.fn(),
    toast: vi.fn(),
    navigate: vi.fn(),
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

function currentPly({ session }: Started): number {
  const view = session.getView();
  return view.history.length - view.game!.start.length;
}

/** Plays the scripted move of every user turn until the user is to move at `ply`. */
async function advanceTo(started: Started, ply: number): Promise<void> {
  for (let guard = 0; guard < 100; guard++) {
    await flush();
    const { session, board } = started;
    if (!board.handler || session.getView().phase.kind !== 'yourMove') continue;
    if (currentPly(started) >= ply) return;
    const view = session.getView();
    board.userMove(sanToUci(board.fen(), view.game!.moves[currentPly(started)]));
  }
  throw new Error(`Never reached ply ${ply}`);
}

async function waitForPhase(started: Started, kind: string): Promise<void> {
  for (let guard = 0; guard < 100; guard++) {
    await flush();
    if (started.session.getView().phase.kind === kind) return;
  }
  throw new Error(`Never reached phase ${kind}, stuck in ${started.session.getView().phase.kind}`);
}

/** Plays the scripted move on every normal turn until the session reaches `kind`. */
async function playUntilPhase(started: Started, kind: string): Promise<void> {
  for (let guard = 0; guard < 200; guard++) {
    await flush();
    const { session, board } = started;
    if (session.getView().phase.kind === kind) return;
    if (board.handler) board.userMove(sanToUci(board.fen(), session.getView().game!.moves[currentPly(started)]));
  }
  throw new Error(`Never reached phase ${kind}`);
}

const outcomes = (...correct: boolean[]): StepOutcome[] =>
  correct.map((c, i) => ({ step: (['spot', 'find', 'solve', 'hold'] as const)[i], correct: c }));

beforeEach(() => {
  vi.mocked(chooseMoments).mockReset();
  vi.mocked(chooseMoments).mockImplementation(() => new Map());
});

describe('starting a game', () => {
  it('plays the opening instantly, then the first opponent move', async () => {
    const started = startSession();
    await flush();
    const { board, deps } = started;
    expect(board.calls[0]).toBe('set:false');
    expect(deps.loadGame).toHaveBeenCalledWith('italian', 1400, GAME_1);
    expect(board.calls).toContain('play:g8f6');
    expect(started.session.getView().history).toEqual(['e4', 'e5', 'Nf3', 'Nc6', 'Bc4', 'Nf6']);
  });

  it('keeps the view in step with the moves played', async () => {
    const started = await startAt(1);
    const view = started.session.getView();
    expect(view.fen).toBe(started.board.fen());
    expect(view.game?.id).toBe(GAME_1);
  });

  it('shows who is thinking while the opponent waits 400 to 700 ms', async () => {
    const started = startSession();
    let release!: () => void;
    started.deps.wait.mockImplementation(() => new Promise<void>((resolve) => (release = resolve)));
    await flush();
    expect(started.session.getView().status).toBe('Black is thinking…');
    const ms = started.deps.wait.mock.calls[0][0];
    expect(ms).toBeGreaterThanOrEqual(400);
    expect(ms).toBeLessThan(700);
    expect(started.board.calls).not.toContain('play:g8f6');
    release();
    await flush();
    expect(started.board.calls).toContain('play:g8f6');
  });

  it('names white as the thinker for a black user', async () => {
    const game = makeGame('ck', ['d4', 'd5', 'Nc3'], { side: 'b', start: ['e4', 'c6'], opening: 'caro-kann' });
    const started = startSession({ games: [game] });
    started.deps.wait.mockImplementation(() => new Promise<void>(() => {}));
    await flush();
    expect(started.session.getView().status).toBe('White is thinking…');
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

  it('chooses moments for the depth and quick setting with a seed from the game id', async () => {
    startSession({ depth: 4 });
    await flush();
    const [turns, depth, options] = vi.mocked(chooseMoments).mock.calls[0];
    expect(turns).toHaveLength(fixtureGame(GAME_1).turns.length);
    expect(depth).toBe(4);
    expect(options?.quick).toBe(false);
    expect(typeof options?.seed).toBe('number');
  });
});

describe('a normal turn', () => {
  it('keeps the scripted move and the opponent replies', async () => {
    const started = await startAt(1);
    expect(started.session.getView().phase.kind).toBe('yourMove');
    expect(started.board.userMove('d2d4')).toBe(true);
    await flush();
    expect(started.board.calls).toContain('play:f6e4');
    expect(started.session.getView().history.slice(-2)).toEqual(['d4', 'Nxe4']);
  });

  it('says a different holding move works too and snaps it back', async () => {
    const started = await startAt(1);
    expect(started.board.userMove('d2d3')).toBe(false);
    expect(started.deps.toast).toHaveBeenCalledWith('That works too. This game continues with d4 — play it to go on.');
    expect(started.session.getView().phase.kind).toBe('yourMove');
    expect(started.board.handler).not.toBeNull();
    expect(started.board.userMove('d2d4')).toBe(true);
  });

  it('treats an inaccuracy the same way', async () => {
    const started = await startAt(1);
    expect(started.board.userMove('d1e2')).toBe(false);
    expect(started.deps.toast).toHaveBeenCalledWith(expect.stringContaining('That works too.'));
  });

  it('says a move outside the analysis is not covered', async () => {
    const started = await startAt(1);
    expect(started.board.userMove('a2a3')).toBe(false);
    expect(started.deps.toast).toHaveBeenCalledWith('This game continues with d4.');
    expect(started.session.getView().showMe).toBeNull();
  });

  it('calls a mistake a loss of material and offers the refutation', async () => {
    const started = await startAt(3);
    expect(started.board.userMove('c4d5')).toBe(false);
    expect(started.deps.toast).toHaveBeenCalledWith('That loses material. Tap Show me to see why.');
    expect(started.session.getView().showMe).toEqual({ turnIndex: 1, uci: 'c4d5' });
  });

  it('shows the refutation, then returns to the same position with input back on', async () => {
    const started = await startAt(3);
    started.board.userMove('c4d5');
    const fenBefore = started.board.fen();
    started.session.showLines();
    expect(started.session.getView().phase).toEqual({ kind: 'lines', turnIndex: 1, uci: 'c4d5' });
    expect(started.board.handler).toBeNull();

    await started.session.closeLines();
    expect(started.session.getView().phase.kind).toBe('yourMove');
    expect(started.board.fen()).toBe(fenBefore);
    expect(started.board.handler).not.toBeNull();
    expect(started.board.lastMove).toBe('f6e4');
  });

  it('clears the offer once the user moves on', async () => {
    const started = await startAt(3);
    started.board.userMove('c4d5');
    started.board.userMove('d4e5');
    await advanceTo(started, 5);
    expect(started.session.getView().showMe).toBeNull();
  });

  it('ignores closeLines when the lines are not open', async () => {
    const started = await startAt(1);
    await started.session.closeLines();
    expect(started.session.getView().phase.kind).toBe('yourMove');
  });
});

describe('switching to a sibling game', () => {
  const a = () => makeGame('a', ['Nf6', 'd4', 'Nxe4', 'dxe5']);
  const b = () => makeGame('b', ['Nf6', 'd3', 'd5', 'exd5']);

  it('moves to the game that continues with the played move, without a word', async () => {
    const started = startSession({ games: [a(), b()] });
    await advanceTo(started, 1);
    expect(started.board.userMove('d2d3')).toBe(true);
    await flush();
    expect(started.deps.loadGame).toHaveBeenLastCalledWith('italian', 1400, 'b');
    expect(started.session.getView().game!.id).toBe('b');
    expect(started.deps.toast).not.toHaveBeenCalled();
    expect(started.board.calls).toContain('play:d7d5');
  });

  it('computes the moments again for the new game', async () => {
    const started = startSession({ games: [a(), b()] });
    await advanceTo(started, 1);
    started.board.userMove('d2d3');
    await flush();
    const lastCall = vi.mocked(chooseMoments).mock.calls.at(-1)!;
    expect(lastCall[0]).toBe(started.session.getView().game!.turns);
  });

  it('stays in the current game when it continues with the played move', async () => {
    const started = startSession({ games: [a(), b()] });
    await advanceTo(started, 1);
    started.board.userMove('d2d4');
    await flush();
    expect(started.session.getView().game!.id).toBe('a');
    expect(started.deps.loadGame).toHaveBeenCalledTimes(1);
  });

  it('finishes the new game and records its id', async () => {
    const started = startSession({ games: [a(), b()] });
    await advanceTo(started, 1);
    started.board.userMove('d2d3');
    await advanceTo(started, 3);
    started.board.userMove('e4d5');
    await flush();
    expect(started.deps.recordGame).toHaveBeenCalledWith(expect.objectContaining({ gameId: 'b' }));
  });
});

describe('a pause', () => {
  it('waits for the pause sheet, records the moment and carries on from resumePly', async () => {
    momentsAt({ 3: 'pause' });
    const started = startSession({ depth: 3 });
    await advanceTo(started, 1);
    started.board.userMove('d2d4');
    await waitForPhase(started, 'pause');
    expect(started.session.getView().phase).toEqual({ kind: 'pause', turnIndex: 1, type: 'pause' });
    expect(started.board.handler).toBeNull();

    // What the pause sheet does: plays the user's move on the board, then reports back.
    await started.board.playMove('d4e5');
    started.session.pauseDone({ outcomes: outcomes(true, true, false), resumePly: 4 });
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
    expect(started.board.calls).toContain('play:d7d6');
    expect(started.session.getView().history.slice(-3)).toEqual(['Nxe4', 'dxe5', 'd6']);
  });

  it('keeps the model in step after a play-out and syncs a board that is behind', async () => {
    momentsAt({ 3: 'pause' });
    const started = startSession({ depth: 4 });
    await advanceTo(started, 1);
    started.board.userMove('d2d4');
    await waitForPhase(started, 'pause');
    // The sheet reports the play-out as done but the board was left at the pause position.
    started.session.pauseDone({ outcomes: outcomes(true), resumePly: 6 });
    await flush();
    const { history } = started.session.getView();
    expect(history.slice(-4)).toEqual(['dxe5', 'd6', 'O-O', 'dxe5']);
    expect(started.board.calls).toContain('set:true');
    const model = new Chess();
    history.forEach((san) => model.move(san));
    expect(started.board.fen()).toBe(model.fen());
  });

  it('always moves on by at least one move', async () => {
    momentsAt({ 3: 'pause' });
    const started = startSession();
    await advanceTo(started, 1);
    started.board.userMove('d2d4');
    await waitForPhase(started, 'pause');
    started.session.pauseDone({ outcomes: outcomes(true), resumePly: 3 });
    await flush();
    expect(started.session.getView().history.at(-1)).toBe('d6');
  });

  it('asks a nothing pause as such', async () => {
    momentsAt({ 23: 'nothing' });
    const started = startSession();
    await playUntilPhase(started, 'pause');
    expect(started.session.getView().phase).toEqual({ kind: 'pause', turnIndex: 11, type: 'nothing' });
  });

  it('celebrates a level-up when the depth changes', async () => {
    momentsAt({ 3: 'pause' });
    const started = startSession({ depth: 1 });
    started.deps.recordMoment.mockReturnValue({ depthChanged: 2 });
    await advanceTo(started, 1);
    started.board.userMove('d2d4');
    await waitForPhase(started, 'pause');
    await started.board.playMove('d4e5');
    started.session.pauseDone({ outcomes: outcomes(true), resumePly: 4 });
    await flush();
    expect(started.deps.celebrate).toHaveBeenCalledWith('levelup');
    expect(started.deps.toast).toHaveBeenCalledWith('New step unlocked');
    expect(started.session.getView().depth).toBe(2);
  });

  it('fills the progress dots as pauses are found or missed', async () => {
    momentsAt({ 3: 'pause', 7: 'nothing' });
    const started = startSession();
    await advanceTo(started, 1);
    expect(started.session.getView().dots).toEqual(['todo', 'todo']);
    started.board.userMove('d2d4');
    await waitForPhase(started, 'pause');
    expect(started.session.getView().dots).toEqual(['now', 'todo']);
    await started.board.playMove('d4e5');
    started.session.pauseDone({ outcomes: outcomes(true, false), resumePly: 4 });
    await playUntilPhase(started, 'pause');
    expect(started.session.getView().dots).toEqual(['bad', 'now']);
    started.session.pauseDone({ outcomes: outcomes(true, true), resumePly: 8 });
    await flush();
    expect(started.session.getView().dots).toEqual(['bad', 'good']);
  });
});

describe('a silent check', () => {
  it('rewards the scripted move found unprompted and keeps it', async () => {
    momentsAt({ 7: 'silent' });
    const started = startSession({ depth: 2 });
    await advanceTo(started, 7);
    expect(started.session.getView().phase.kind).toBe('yourMove');
    expect(started.board.userMove('d1d8')).toBe(true);
    await flush();
    expect(started.deps.celebrate).toHaveBeenCalledWith('silent', { x: 'd'.charCodeAt(0), y: 8 });
    expect(started.deps.recordMoment).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'silent', ply: 7, depth: 2, stars: 1, outcomes: [{ step: 'solve', correct: true }] }),
    );
    expect(started.board.calls).toContain('play:c6d8');
  });

  it('plays the scripted move when the user finds another holding move', async () => {
    momentsAt({ 7: 'silent' });
    const started = startSession();
    await advanceTo(started, 7);
    expect(started.board.userMove('d1e1')).toBe(false);
    await flush();
    expect(started.deps.celebrate).toHaveBeenCalledWith('silent', expect.anything());
    expect(started.board.calls).toContain('play:d1d8');
    expect(started.deps.toast).toHaveBeenCalledWith('This game continues with Qxd8+.');
    expect(started.deps.recordMoment).toHaveBeenCalledWith(expect.objectContaining({ stars: 1 }));
  });

  it('shows the miss card for a move that does not hold, then plays on', async () => {
    momentsAt({ 7: 'silent' });
    const started = startSession();
    await advanceTo(started, 7);
    expect(started.board.userMove('d1d5')).toBe(false);
    await flush();
    expect(started.session.getView().phase).toEqual({ kind: 'miss', turnIndex: 3, playedUci: 'd1d5' });
    expect(started.deps.celebrate).not.toHaveBeenCalled();
    expect(started.deps.recordMoment).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'silent', stars: 0, outcomes: [{ step: 'solve', correct: false }] }),
    );
    expect(started.board.calls).not.toContain('play:d1d8');

    started.session.missContinue();
    await flush();
    expect(started.board.calls).toContain('play:d1d8');
    expect(started.deps.toast).not.toHaveBeenCalledWith(expect.stringContaining('This game continues'));
    expect(started.session.getView().history).toContain('Qxd8+');
  });

  it('does not show a pause or a dot', async () => {
    momentsAt({ 3: 'silent' });
    const started = startSession();
    await advanceTo(started, 3);
    expect(started.session.getView().phase.kind).toBe('yourMove');
    expect(started.session.getView().dots).toEqual([]);
  });
});

describe('the end of a game', () => {
  it('records the summary and opens the recap', async () => {
    momentsAt({ 3: 'pause' });
    const game = makeGame('short', ['Nf6', 'd4', 'Nxe4', 'dxe5']);
    const started = startSession({ games: [game] });
    await advanceTo(started, 1);
    started.board.userMove('d2d4');
    await waitForPhase(started, 'pause');
    await started.board.playMove('d4e5');
    started.session.pauseDone({ outcomes: outcomes(true), resumePly: 4 });
    await flush();
    expect(started.deps.recordGame).toHaveBeenCalledTimes(1);
    const summary = started.deps.recordGame.mock.calls[0][0];
    expect(summary).toMatchObject({ opening: 'italian', level: 1400, gameId: 'short', at: 1234 });
    expect(summary.moments).toHaveLength(1);
    expect(started.deps.navigate).toHaveBeenCalledWith('/recap');
    expect(started.session.getView().phase.kind).toBe('done');
  });

  it('ends after a final move by the user', async () => {
    const game = makeGame('short', ['Nf6', 'd4']);
    const started = startSession({ games: [game] });
    await advanceTo(started, 1);
    started.board.userMove('d2d4');
    await flush();
    expect(started.deps.recordGame).toHaveBeenCalledWith(expect.objectContaining({ gameId: 'short', moments: [] }));
    expect(started.deps.navigate).toHaveBeenCalledWith('/recap');
  });
});

describe('reviewing a moment', () => {
  it('jumps to four plies before, replays them, then pauses', async () => {
    const started = startSession({ review: { gameId: GAME_1, ply: 7 } });
    await waitForPhase(started, 'pause');
    const { board, deps, session } = started;
    expect(board.calls).toEqual(['set:false', 'set:false', 'play:d4e5', 'play:d7d6', 'play:e1g1', 'play:d6e5']);
    expect(deps.wait).toHaveBeenCalledTimes(4);
    expect(deps.wait.mock.calls.every(([ms]) => ms === 250)).toBe(true);
    expect(session.getView().phase).toEqual({ kind: 'pause', turnIndex: 3, type: 'pause' });
    expect(session.getView().history.at(-1)).toBe('dxe5');
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
    started.session.pauseDone({ outcomes: outcomes(true, true, true), resumePly: 8 });
    await flush();
    expect(started.deps.recordMoment).toHaveBeenCalledWith(expect.objectContaining({ ply: 7, review: true, stars: 3 }));
    const summary = started.deps.recordGame.mock.calls[0][0];
    expect(summary.moments).toHaveLength(1);
    expect(summary.moments[0].review).toBe(true);
    expect(started.deps.navigate).toHaveBeenCalledWith('/recap');
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
  it('stops playing and turns the board input off', async () => {
    const started = startSession();
    await advanceTo(started, 1);
    started.session.dispose();
    expect(started.board.handler).toBeNull();
    const callsBefore = started.board.calls.length;
    await flush();
    expect(started.board.calls).toHaveLength(callsBefore);
  });

  it('does not continue an opponent move after dispose', async () => {
    const started = startSession();
    let release!: () => void;
    started.deps.wait.mockImplementation(() => new Promise<void>((resolve) => (release = resolve)));
    await flush();
    started.session.dispose();
    release();
    await flush();
    expect(started.board.calls).not.toContain('play:g8f6');
  });
});

describe('with the real moment selection', () => {
  it('reaches a pause or silent check in the fixture game and finishes the game', async () => {
    vi.mocked(chooseMoments).mockImplementation(realChooseMoments);
    const started = startSession();
    for (let guard = 0; guard < 200 && started.session.getView().phase.kind !== 'done'; guard++) {
      await flush();
      const { board, session } = started;
      const view = session.getView();
      if (view.phase.kind === 'pause') {
        const turn = view.game!.turns[view.phase.turnIndex];
        const target = Math.min(turn.ply + 1, view.game!.moves.length);
        await board.playMove(sanToUci(board.fen(), view.game!.moves[turn.ply]));
        session.pauseDone({ outcomes: outcomes(true), resumePly: target });
      } else if (view.phase.kind === 'miss') {
        session.missContinue();
      } else if (board.handler) {
        board.userMove(sanToUci(board.fen(), view.game!.moves[currentPly(started)]));
      }
    }
    expect(started.session.getView().phase.kind).toBe('done');
    expect(started.deps.recordGame).toHaveBeenCalledTimes(1);
    expect(started.deps.recordGame.mock.calls[0][0].moments.length).toBeGreaterThan(0);
  });
});

async function startAt(ply: number): Promise<Started> {
  const started = startSession();
  await advanceTo(started, ply);
  return started;
}
