import { afterEach, describe, expect, it, vi } from 'vitest';
import fixtureCourse from '../../public/content/italian-1400/course.json';
import type { Game } from '../content/types';
import { learnGame } from '../learn/fixtures';
import queenForKnight from '../pause/fixtures/queen-for-knight.json';
import { italian1, italian2 } from '../pause/testGames';
import { FakeStorage } from '../progress/testkit';
import {
  CLEAN,
  buildCourse,
  candidatesOf,
  levelsByDistance,
  loadPosition,
  pickDrills,
  pickExamples,
  pickLesson,
  practiceOrder,
  setOf,
  spread,
  type Candidate,
  type LessonPosition,
  type PositionSource,
} from './select';
import { positionKey, type CourseFile, type PositionRef, type UnitId } from './types';

function candidate(set: string, n: number, findShare: number, clarity = CLEAN, unit: UnitId = 'fork'): Candidate {
  const ref = { set, gameId: `${set}-${String(n).padStart(4, '0')}`, ply: 9, findShare };
  return { ref, unit, position: `${set}/${n}`, clarity };
}

const games = (cs: Candidate[]) => cs.map((c) => c.ref.gameId);
const shares = (cs: Candidate[]) => cs.map((c) => c.ref.findShare);

describe('candidatesOf', () => {
  it('rates a free knight taken at once as a clean example and a free pawn as a smaller one', () => {
    const [pawn, , , knight] = candidatesOf('italian-1400', italian1);
    expect(knight).toMatchObject({ unit: 'free-piece', ref: { gameId: 'italian-1400-0001', ply: 19, findShare: 0.747 }, clarity: CLEAN });
    expect(pawn).toMatchObject({ unit: 'free-piece', ref: { ply: 3 } });
    expect(pawn.clarity).toBeLessThan(CLEAN);
  });

  it('keeps the critical turns a unit teaches and leaves out plain material wins', () => {
    const found = candidatesOf('caro-kann-1100', learnGame('caro-kann-1100-0025'));
    expect(found.map((c) => [c.ref.ply, c.unit])).toEqual([
      [9, 'traps'],
      [13, 'traps'],
      [17, 'threats'],
      [31, 'threats'],
      [51, 'piece-in-danger'],
      [57, 'threats'],
    ]);
  });

  it('files mate threats under checkmate, ranked below a mate threat that starts at once', () => {
    const found = candidatesOf('italian-1400', queenForKnight as unknown as Game).filter((c) => c.unit === 'checkmate');
    expect(found.map((c) => c.ref.ply)).toEqual([23, 25, 27, 31, 33]);
    expect(found.find((c) => c.ref.ply === 31)!.clarity).toBeGreaterThan(found.find((c) => c.ref.ply === 23)!.clarity);
  });

  it('names the position without its move counters', () => {
    const [first] = candidatesOf('italian-1400', italian1);
    expect(first.position).toBe(italian1.turns[1].fen.split(' ').slice(0, 4).join(' '));
  });
});

describe('spread', () => {
  it('keeps short lists whole', () => {
    expect(spread([1, 2, 3], 5)).toEqual([1, 2, 3]);
  });

  it('takes evenly spaced items, the first and last included', () => {
    const items = Array.from({ length: 31 }, (_, i) => i);
    expect(spread(items, 4)).toEqual([0, 10, 20, 30]);
    expect(new Set(spread(items, 16)).size).toBe(16);
    expect(spread(items, 1)).toEqual([0]);
    expect(spread(items, 0)).toEqual([]);
  });
});

describe('pickExamples', () => {
  it('takes up to three clean examples, the easiest first', () => {
    const own = [0.2, 0.9, 0.5, 0.7].map((share, i) => candidate('italian-1400', i, share));
    expect(shares(pickExamples([own]))).toEqual([0.9, 0.7, 0.5]);
  });

  it('only takes the clearest positions, relaxing the rules when none passes them all', () => {
    const own = [candidate('italian-1400', 1, 0.9, 3), candidate('italian-1400', 2, 0.3, 5), candidate('italian-1400', 3, 0.4, 5)];
    expect(games(pickExamples([own]))).toEqual(['italian-1400-0003', 'italian-1400-0002']);
    expect(pickExamples([[candidate('italian-1400', 1, 0.5, 0)]])).toHaveLength(1);
    expect(pickExamples([[], []])).toEqual([]);
  });

  it('tops up from the nearest level when the set is short, its own examples first', () => {
    const own = [candidate('italian-1400', 1, 0.2)];
    const near = [candidate('italian-1100', 1, 0.9), candidate('italian-1100', 2, 0.8)];
    const far = [candidate('italian-1700', 1, 0.95)];
    expect(games(pickExamples([own, near, far]))).toEqual(['italian-1400-0001', 'italian-1100-0001', 'italian-1100-0002']);
  });

  it('prefers a clean example from another level to a muddled one of its own', () => {
    const own = [candidate('italian-1400', 1, 0.9, 2)];
    const near = [candidate('italian-1100', 1, 0.4)];
    expect(games(pickExamples([own, near]))).toEqual(['italian-1100-0001']);
  });

  it('shows a position reached in two games once', () => {
    const twice = { ...candidate('italian-1400', 2, 0.8), position: 'italian-1400/1' };
    expect(pickExamples([[candidate('italian-1400', 1, 0.8), twice]])).toHaveLength(1);
  });
});

describe('pickDrills', () => {
  it('spreads sixteen positions over the range of difficulty, easiest first', () => {
    const own = Array.from({ length: 31 }, (_, i) => candidate('italian-1400', i, i / 30));
    const drills = pickDrills([own], []);
    expect(drills).toHaveLength(16);
    expect(drills[0].ref.findShare).toBe(1);
    expect(drills.at(-1)!.ref.findShare).toBe(0);
    expect(shares(drills)).toEqual([...shares(drills)].sort((a, b) => b - a));
  });

  it('never uses an example position', () => {
    const own = [0.9, 0.8, 0.7].map((share, i) => candidate('italian-1400', i, share));
    const twin = { ...candidate('italian-1700', 9, 0.6), position: own[0].position };
    expect(games(pickDrills([own, [twin]], [own[0]]))).toEqual(['italian-1400-0001', 'italian-1400-0002']);
  });

  it('fills a short set from the nearest levels, after its own positions', () => {
    const own = [candidate('italian-1400', 1, 0.1)];
    const near = Array.from({ length: 10 }, (_, i) => candidate('italian-1100', i, 0.5 + i / 100));
    const far = Array.from({ length: 10 }, (_, i) => candidate('italian-1700', i, 0.9));
    const drills = pickDrills([own, near, far], []);
    expect(drills).toHaveLength(16);
    expect(drills.map((c) => c.ref.set)).toEqual(['italian-1400', ...Array(10).fill('italian-1100'), ...Array(5).fill('italian-1700')]);
  });
});

describe('buildCourse', () => {
  it('builds the test course from the test games', () => {
    const candidates = new Map([['italian-1400', [italian1, italian2].flatMap((g) => candidatesOf('italian-1400', g))]]);
    expect(buildCourse('italian-1400', candidates)).toEqual(fixtureCourse);
  });

  it('borrows from the same opening only, each position keeping its own set', () => {
    const candidates = new Map([
      ['italian-1400', [candidate('italian-1400', 1, 0.6), candidate('italian-1400', 2, 0.4)]],
      ['caro-kann-1100', [candidate('caro-kann-1100', 1, 0.9, CLEAN, 'pin')]],
    ]);
    const course = buildCourse('italian-1100', candidates);
    expect(course).toMatchObject({ v: 1, opening: 'italian', level: 1100 });
    expect(course.units.map((u) => u.id)).toEqual(['fork']);
    expect(course.units[0].examples.map((r) => r.set)).toEqual(['italian-1400', 'italian-1400']);
    expect(course.units[0].drills).toEqual([]);
  });

  it('lists units in teaching order and leaves out units with no example', () => {
    const candidates = new Map([['italian-1400', [candidate('italian-1400', 1, 0.5, CLEAN, 'traps'), candidate('italian-1400', 2, 0.5, CLEAN, 'free-piece')]]]);
    expect(buildCourse('italian-1400', candidates).units.map((u) => u.id)).toEqual(['free-piece', 'traps']);
  });

  it('refuses a folder that is not a set', () => {
    expect(() => buildCourse('italian', new Map())).toThrow();
  });
});

describe('sets and levels', () => {
  it('reads a set name back into its opening and level', () => {
    expect(setOf('caro-kann-1700')).toEqual({ opening: 'caro-kann', level: 1700 });
    expect(setOf('italian-1500')).toBeNull();
    expect(setOf('sicilian-1400')).toBeNull();
  });

  it('orders the levels by distance, the lower first on a tie', () => {
    expect(levelsByDistance(1400)).toEqual([1400, 1100, 1700, 2000]);
    expect(levelsByDistance(2000)).toEqual([2000, 1700, 1400, 1100]);
  });
});

const ref = (n: number): PositionRef => ({ set: 'italian-1400', gameId: `g${n}`, ply: n, findShare: 1 - n / 100 });

function fakeSource({ broken = [] as number[], seen = [] as number[] } = {}) {
  const loads: number[] = [];
  const source: PositionSource = {
    load: async (r) => {
      loads.push(r.ply);
      return broken.includes(r.ply) ? null : ({ ref: r, game: {} as Game, turnIndex: 0 } satisfies LessonPosition);
    },
    seen: (r) => seen.includes(r.ply),
  };
  return { source, loads };
}

const course = (examples: number[], drills: number[]): CourseFile => ({
  v: 1,
  opening: 'italian',
  level: 1400,
  units: [{ id: 'fork', examples: examples.map(ref), drills: drills.map(ref) }],
});

const plies = (positions: LessonPosition[]) => positions.map((p) => p.ref.ply);

describe('practiceOrder', () => {
  it('puts fresh positions first and keeps the course order within each', () => {
    expect(practiceOrder([1, 2, 3, 4].map(ref), (r) => r.ply % 2 === 1).map((r) => r.ply)).toEqual([2, 4, 1, 3]);
  });
});

describe('pickLesson', () => {
  it('shows the first example that loads', async () => {
    const { source } = fakeSource({ broken: [1] });
    expect((await pickLesson(course([1, 2, 3], []), 'fork', source))!.example.ref.ply).toBe(2);
  });

  it('gives up when no example loads or the course lacks the unit', async () => {
    expect(await pickLesson(course([1], [5]), 'fork', fakeSource({ broken: [1] }).source)).toBeNull();
    expect(await pickLesson(course([1], [5]), 'pin', fakeSource().source)).toBeNull();
  });

  it('asks four fresh positions, loading no more than it needs', async () => {
    const { source, loads } = fakeSource({ seen: [10, 11] });
    const lesson = await pickLesson(course([1], [10, 11, 12, 13, 14, 15, 16, 17]), 'fork', source);
    expect(plies(lesson!.drills)).toEqual([12, 13, 14, 15]);
    expect(loads).toEqual([1, 12, 13, 14, 15]);
  });

  it('skips positions that do not load and falls back to ones seen before', async () => {
    const { source } = fakeSource({ seen: [10, 11, 12], broken: [13] });
    const lesson = await pickLesson(course([1], [10, 11, 12, 13, 14]), 'fork', source);
    expect(plies(lesson!.drills)).toEqual([14, 10, 11, 12]);
  });
});

describe('on the device', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function serve(served: Record<string, unknown>) {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        const name = Object.keys(served).find((path) => url.endsWith(path));
        return name ? new Response(JSON.stringify(served[name])) : new Response('missing', { status: 404 });
      }),
    );
  }

  it('loads a position with the index of its turn, and nothing for a missing game, ply or set', async () => {
    serve({ '/italian-1400/games/italian-1400-0001.json': italian1 });
    const position = await loadPosition({ set: 'italian-1400', gameId: 'italian-1400-0001', ply: 19, findShare: 0.7 });
    expect(position!.game.id).toBe('italian-1400-0001');
    expect(position!.game.turns[position!.turnIndex].ply).toBe(19);
    expect(await loadPosition({ set: 'italian-1400', gameId: 'italian-1400-0001', ply: 20, findShare: 0.7 })).toBeNull();
    expect(await loadPosition({ set: 'italian-1400', gameId: 'italian-1400-0009', ply: 19, findShare: 0.7 })).toBeNull();
    expect(await loadPosition({ set: 'italian', gameId: 'italian-1400-0001', ply: 19, findShare: 0.7 })).toBeNull();
  });

  it('asks positions from fresh games first, then from games played or practised', async () => {
    const game3 = learnGame('italian-1400-0003');
    serve({ '-0001.json': italian1, '-0002.json': italian2, '-0003.json': game3 });
    const at = (n: number, ply: number) => ({ set: 'italian-1400', gameId: `italian-1400-000${n}`, ply, findShare: 0.5 });
    const storage = new FakeStorage();
    const progress = {
      v: 1,
      games: [{ opening: 'italian', level: 1400, gameId: 'italian-1400-0001', at: 1 }],
      lessons: { italian: { 'piece-in-danger': { drills: [{ key: positionKey(at(3, 13)), correct: true, at: 2 }] } } },
    };
    storage.data.set('cc.progress.v1', JSON.stringify(progress));
    vi.stubGlobal('localStorage', storage);
    vi.resetModules();
    const select = await import('./select');
    const file: CourseFile = {
      v: 1,
      opening: 'italian',
      level: 1400,
      units: [{ id: 'free-piece', examples: [at(1, 19)], drills: [at(1, 3), at(3, 13), at(3, 7), at(2, 3)] }],
    };
    const lesson = await select.pickLesson(file, 'free-piece');
    expect(lesson!.example.ref).toEqual(at(1, 19));
    expect(lesson!.drills.map((p) => positionKey(p.ref))).toEqual([
      'italian-1400/italian-1400-0002:3',
      'italian-1400/italian-1400-0001:3',
      'italian-1400/italian-1400-0003:13',
      'italian-1400/italian-1400-0003:7',
    ]);
  });
});
