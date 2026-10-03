import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Game, Turn } from '../content/types';
import { FakeStorage } from '../progress/testkit';
import { exportReviews, flipTurn, loadNotes, loadPilotItems, pilotItems, reviewedCount, saveNotes, sanLine } from './pilot';

const FEN = 'r1bqkb1r/pppp1ppp/2n5/4p3/2BPn3/5N2/PPP2PPP/RNBQK2R w KQkq - 0 5';

function turn(ply: number, label: Turn['label']): Turn {
  return {
    ply, moveNo: ply, fen: FEN, label, kinds: ['win'], wrongShare: 0.231, findShare: 0.455, source: 'Lichess', human: [], grades: {},
    refutations: {}, bestWin: 60, material: 0, lines: {}, mistakeMove: null, keySquares: [], trigger: true, inCheck: false,
  };
}

describe('lines as SAN', () => {
  it('numbers a line from the position', () => {
    expect(sanLine(FEN, ['d4e5', 'd7d5', 'c4d5', 'c8f5', 'd5c6', 'b7c6'])).toBe('5.dxe5 d5 6.Bxd5 Bf5 7.Bxc6+ bxc6');
  });

  it('marks a line that starts with Black', () => {
    expect(sanLine(flipTurn(FEN), ['e5d4', 'e1g1'])).toBe('5...exd4 6.O-O');
  });

  it('moves to the next number when White is the one passing', () => {
    const blackToMove = 'rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 2';
    expect(flipTurn(blackToMove)).toBe('rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 3');
  });

  it('stops at an illegal move and survives a bad position', () => {
    expect(sanLine(FEN, ['d4e5', 'a1a8', 'd7d5'])).toBe('5.dxe5');
    expect(sanLine('not a fen', ['e2e4'])).toBe('e2e4');
  });
});

describe('pilot items', () => {
  it('keeps critical and nothing turns only', () => {
    const game = { id: 'g1', opening: 'italian', level: 1400, side: 'w', turns: [turn(1, 'gray'), turn(3, 'critical'), turn(5, 'nothing')] } as Game;
    expect(pilotItems(game).map((i) => i.key)).toEqual(['g1:3', 'g1:5']);
  });
});

describe('review notes', () => {
  let storage: FakeStorage;

  beforeEach(() => {
    storage = new FakeStorage();
    vi.stubGlobal('localStorage', storage);
  });
  afterEach(() => vi.unstubAllGlobals());

  const game = { id: 'g1', opening: 'italian', level: 1400, side: 'w', turns: [turn(3, 'critical'), turn(5, 'nothing'), turn(7, 'critical')] } as Game;

  it('saves and reloads notes, dropping junk', () => {
    saveNotes({ 'g1:3': { vote: 'up', note: 'clear' }, 'g1:5': { note: 'hmm' } });
    expect(loadNotes()).toEqual({ 'g1:3': { vote: 'up', note: 'clear' }, 'g1:5': { note: 'hmm' } });
    storage.setItem('cc.pilot.v1', JSON.stringify({ v: 1, notes: { a: { vote: 'maybe' }, b: 4 } }));
    expect(loadNotes()).toEqual({});
  });

  it('counts only voted items as reviewed', () => {
    const items = pilotItems(game);
    expect(reviewedCount(items, { 'g1:3': { vote: 'down' }, 'g1:5': { note: 'x' } })).toBe(1);
  });

  it('exports the items that have a vote or note', () => {
    const items = pilotItems(game);
    const out = JSON.parse(exportReviews(items, { 'g1:3': { vote: 'down', note: 'wrong label' } }, 0));
    expect(out).toMatchObject({ reviewed: 1, total: 3 });
    expect(out.items).toEqual([expect.objectContaining({ key: 'g1:3', vote: 'down', note: 'wrong label', label: 'critical', wrongShare: 0.231 })]);
  });
});

describe('loading the pilot items', () => {
  const BASE = '/chess-coach/content/';

  function gameFile(opening: string, level: number, n: number, labels: Turn['label'][]): Game {
    return {
      id: `${opening}-${level}-000${n}`, opening, level, side: opening === 'italian' ? 'w' : 'b', start: [], moves: [],
      turns: labels.map((label, i) => turn(i * 2 + 1, label)),
    } as Game;
  }

  function serve(files: Record<string, unknown>) {
    const requested: string[] = [];
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      requested.push(url);
      return url in files ? new Response(JSON.stringify(files[url])) : new Response('missing', { status: 404 });
    }));
    return requested;
  }

  afterEach(() => vi.unstubAllGlobals());

  it('reads the manifest, every game of every set and keeps critical and nothing turns in order', async () => {
    const italian = [gameFile('italian', 1400, 1, ['gray', 'critical', 'nothing']), gameFile('italian', 1400, 2, ['critical'])];
    const caro = [gameFile('caro-kann', 1700, 1, ['nothing', 'gray'])];
    const requested = serve({
      [`${BASE}manifest.json`]: { version: 'x', sets: ['italian-1400', 'caro-kann-1700'] },
      [`${BASE}italian-1400/index.json`]: { games: italian.map((g) => ({ id: g.id })) },
      [`${BASE}caro-kann-1700/index.json`]: { games: caro.map((g) => ({ id: g.id })) },
      ...Object.fromEntries([...italian, ...caro].map((g) => [`${BASE}${g.opening}-${g.level}/games/${g.id}.json`, g])),
    });
    const progress: [number, number][] = [];

    const items = await loadPilotItems((done, total) => progress.push([done, total]));

    expect(items.map((i) => i.key)).toEqual(['italian-1400-0001:3', 'italian-1400-0001:5', 'italian-1400-0002:1', 'caro-kann-1700-0001:1']);
    expect(items.map((i) => [i.opening, i.level, i.side])).toEqual([
      ['italian', 1400, 'w'], ['italian', 1400, 'w'], ['italian', 1400, 'w'], ['caro-kann', 1700, 'b'],
    ]);
    expect(progress.at(-1)).toEqual([3, 3]);
    expect(requested).toContain(`${BASE}caro-kann-1700/index.json`);
  });

  it('skips a set that has no content yet', async () => {
    const game = gameFile('italian', 1400, 1, ['critical']);
    serve({
      [`${BASE}manifest.json`]: { sets: ['caro-kann-1100', 'italian-1400'] },
      [`${BASE}italian-1400/index.json`]: { games: [{ id: game.id }] },
      [`${BASE}italian-1400/games/${game.id}.json`]: game,
    });
    expect((await loadPilotItems(() => {})).map((i) => i.key)).toEqual(['italian-1400-0001:1']);
  });

  it('gives an empty list for an empty manifest and rejects when the manifest or a game is missing', async () => {
    serve({ [`${BASE}manifest.json`]: { sets: [] } });
    expect(await loadPilotItems(() => {})).toEqual([]);

    serve({});
    await expect(loadPilotItems(() => {})).rejects.toThrow();

    serve({
      [`${BASE}manifest.json`]: { sets: ['italian-1400'] },
      [`${BASE}italian-1400/index.json`]: { games: [{ id: 'italian-1400-0009' }] },
    });
    await expect(loadPilotItems(() => {})).rejects.toThrow('not found');
  });
});
