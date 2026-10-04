import { afterEach, describe, expect, it, vi } from 'vitest';
import fixtureCourse from '../../public/content/italian-1400/course.json';
import type { Game } from '../content/types';
import { learnGame, realTurn } from '../learn/fixtures';
import { themeFor } from '../learn/themes';
import queenForKnight from '../pause/fixtures/queen-for-knight.json';
import { italian1, italian2 } from '../pause/testGames';
import { FakeStorage } from '../progress/testkit';
import { planCandidatesOf } from './openings/mine';
import { readTraps, trapEntry } from './openings/trapGames';
import type { TrapGame } from './openings/types';
import {
  CLEAN,
  buildCourses,
  canSidestep,
  candidatesOf,
  levelsByDistance,
  loadPosition,
  pickDrills,
  pickExample,
  pickExamples,
  pickPractice,
  practiceOrder,
  setOf,
  spread,
  type Candidate,
  type LessonPosition,
  type PositionSource,
} from './select';
import { positionKey, type CourseFile, type LessonId, type PositionRef } from './types';

vi.mock('./openings/trapGames', async (actual) => {
  const real = await actual<typeof import('./openings/trapGames')>();
  return { ...real, trapEntry: vi.fn(real.trapEntry) };
});

function candidate(set: string, n: number, findShare: number, clarity = CLEAN, unit: LessonId = 'fork'): Candidate {
  const ref = { set, gameId: `${set}-${String(n).padStart(4, '0')}`, ply: 9, findShare };
  return { ref, unit, position: `${set}/${n}`, clarity, sound: true, tier: 0, contested: false, picture: `${set}/${n}` };
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

describe('which examples hold up', () => {
  const only = (key: Parameters<typeof realTurn>[0]) => candidatesOf('caro-kann-1400', realTurn(key))[0];

  it('takes a win the engine backs and the line shows, ranking a counted capture after a piece nobody guards', () => {
    expect(only('caro-kann-1400-0046#9')).toMatchObject({ unit: 'free-piece', sound: true, tier: 1 });
  });

  it('rejects a win the engine does not back', () => {
    expect(realTurn('caro-kann-1700-0023#9').turns[0].bestWin).toBeLessThan(75);
    expect(only('caro-kann-1700-0023#9')).toMatchObject({ unit: 'trapped', sound: false });
  });

  it('rejects a win whose line, once the captures are over, nets less than it claims', () => {
    // fxe3 Nxf8 Bxd2: a knight and a bishop for a rook.
    expect(only('caro-kann-1700-0008#18')).toMatchObject({ unit: 'remove-defender', sound: false });
  });

  it('rejects a target that can simply trade itself off for the piece that would win it', () => {
    expect(only('italian-1700-0061#17').sound).toBe(false);
    expect(canSidestep(themeFor(realTurn('italian-1700-0061#17'), 0).tactic)).toBe(true);
    expect(canSidestep(themeFor(realTurn('caro-kann-1700-0003#21'), 0).tactic)).toBe(false);
  });

  it('marks a position where another move is about as good as contested', () => {
    expect(only('caro-kann-1400-0030#17').contested).toBe(true);
    expect(only('caro-kann-1100-0248#18').contested).toBe(false);
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

  it('takes one example per game and per picture', () => {
    const first = candidate('italian-1400', 1, 0.9);
    const sameGame = { ...candidate('italian-1400', 2, 0.8), ref: { ...first.ref, ply: 21 } };
    const samePicture = { ...candidate('italian-1400', 3, 0.7), picture: first.picture };
    const other = candidate('italian-1400', 4, 0.6);
    expect(games(pickExamples([[first, sameGame, samePicture, other]]))).toEqual(['italian-1400-0001', 'italian-1400-0004']);
  });

  it('leaves out examples that do not hold up', () => {
    const unsound = { ...candidate('italian-1400', 1, 0.9), sound: false };
    expect(games(pickExamples([[unsound, candidate('italian-1400', 2, 0.5, 3)]]))).toEqual(['italian-1400-0002']);
  });

  it('puts textbook cases with a clear answer first, its own level before the others', () => {
    const threat = { ...candidate('italian-1400', 1, 0.9, CLEAN, 'checkmate'), tier: 9 };
    const contested = { ...candidate('italian-1400', 2, 0.8, CLEAN, 'checkmate'), contested: true };
    const mate = candidate('italian-1100', 1, 0.3, CLEAN, 'checkmate');
    const farMate = candidate('italian-1700', 1, 0.9, CLEAN, 'checkmate');
    const nearThreat = { ...candidate('italian-1100', 2, 0.9, CLEAN, 'checkmate'), tier: 9 };
    expect(games(pickExamples([[threat, contested], [mate, nearThreat], [farMate]]))).toEqual([
      'italian-1400-0002',
      'italian-1400-0001',
      'italian-1100-0001',
    ]);
    expect(games(pickExamples([[], [nearThreat, mate], [farMate]]))).toEqual(['italian-1100-0001', 'italian-1700-0001', 'italian-1100-0002']);
  });

  it('leaves a plan position whose example text would not hold to practice', () => {
    const plain = { ...candidate('italian-1400', 1, 0.9, CLEAN, 'italian-slow'), textbook: false };
    const textbook = { ...candidate('italian-1400', 2, 0.5, CLEAN, 'italian-slow'), textbook: true };
    expect(games(pickExamples([[plain, textbook]]))).toEqual(['italian-1400-0002']);
    expect(games(pickDrills([[plain, textbook]], [textbook]))).toEqual(['italian-1400-0001']);
  });

  it('opens with the next position when the best is overused, a less clear one if need be', () => {
    const best = candidate('italian-1400', 1, 0.9);
    const next = candidate('italian-1400', 2, 0.5);
    const muddled = candidate('italian-1100', 1, 0.9, 3);
    const used = (...cs: Candidate[]) => (position: string) => cs.some((c) => c.position === position);
    expect(games(pickExamples([[best, next], [muddled]], used(best)))).toEqual(['italian-1400-0002', 'italian-1400-0001']);
    expect(games(pickExamples([[best, next], [muddled]], used(best, next)))).toEqual([
      'italian-1100-0001',
      'italian-1400-0001',
      'italian-1400-0002',
    ]);
    // With nothing else to show, a repeat beats no lesson.
    expect(games(pickExamples([[best]], used(best)))).toEqual(['italian-1400-0001']);
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

  it('leaves out positions that do not hold up', () => {
    const own = [0.9, 0.8, 0.7].map((share, i) => ({ ...candidate('italian-1400', i, share), sound: i !== 1 }));
    expect(games(pickDrills([own], []))).toEqual(['italian-1400-0000', 'italian-1400-0002']);
  });

  it('fills the places of unsound positions from the nearest level', () => {
    const own = Array.from({ length: 16 }, (_, i) => ({ ...candidate('italian-1400', i, 0.5), sound: i < 2 }));
    const near = Array.from({ length: 20 }, (_, i) => candidate('italian-1100', i, 0.5));
    const far = Array.from({ length: 20 }, (_, i) => candidate('italian-1700', i, 0.5));
    const drills = pickDrills([own, near, far], []);
    expect(drills.map((c) => c.ref.set)).toEqual([...Array(2).fill('italian-1400'), ...Array(14).fill('italian-1100')]);
  });
});

describe('buildCourses', () => {
  const firsts = (courses: Map<string, CourseFile>, unit: LessonId) =>
    [...courses].map(([set, course]) => [set, course.units.find((u) => u.id === unit)?.examples[0]?.gameId]);

  it('builds the test course from the test games', () => {
    const mined = (g: Game) => [...candidatesOf('italian-1400', g), ...planCandidatesOf('italian-1400', g)];
    const candidates = new Map([['italian-1400', [italian1, italian2].flatMap(mined)]]);
    expect(buildCourses(candidates, readTraps()).get('italian-1400')).toEqual(fixtureCourse);
  });

  it('borrows from the same opening only, each position keeping its own set', () => {
    const candidates = new Map([
      ['italian-1100', []],
      ['italian-1400', [candidate('italian-1400', 1, 0.6), candidate('italian-1400', 2, 0.4)]],
      ['caro-kann-1100', [candidate('caro-kann-1100', 1, 0.9, CLEAN, 'pin')]],
    ]);
    const course = buildCourses(candidates).get('italian-1100')!;
    expect(course).toMatchObject({ v: 1, opening: 'italian', level: 1100 });
    expect(course.units.map((u) => u.id)).toEqual(['fork']);
    expect(course.units[0].examples.map((r) => r.set)).toEqual(['italian-1400', 'italian-1400']);
    expect(course.units[0].drills).toEqual([]);
  });

  it('lists units in teaching order and leaves out units with no example', () => {
    const candidates = new Map([['italian-1400', [candidate('italian-1400', 1, 0.5, CLEAN, 'traps'), candidate('italian-1400', 2, 0.5, CLEAN, 'free-piece')]]]);
    expect(buildCourses(candidates).get('italian-1400')!.units.map((u) => u.id)).toEqual(['free-piece', 'traps']);
  });

  it('opens each level with its own position when it has one', () => {
    const mate = (set: string, n: number, tier: number) => ({ ...candidate(set, n, 0.5, CLEAN, 'checkmate'), tier });
    const candidates = new Map(['italian-1100', 'italian-1400', 'italian-1700', 'italian-2000'].map((set, i) => [set, [mate(set, i, i === 2 ? 0 : 9)]]));
    expect(firsts(buildCourses(candidates), 'checkmate')).toEqual([
      ['italian-1100', 'italian-1100-0000'],
      ['italian-1400', 'italian-1400-0001'],
      ['italian-1700', 'italian-1700-0002'],
      ['italian-2000', 'italian-2000-0003'],
    ]);
  });

  it('never opens more than two levels with one position, and lets its own level keep it', () => {
    const own = candidate('italian-1700', 1, 0.9);
    const spare = candidate('italian-2000', 1, 0.2);
    const candidates = new Map([
      ['italian-1100', []],
      ['italian-1400', []],
      ['italian-1700', [own]],
      ['italian-2000', [spare]],
      ['caro-kann-1100', []],
    ]);
    const opened = firsts(buildCourses(candidates), 'fork');
    expect(opened).toEqual([
      ['italian-1100', 'italian-1700-0001'],
      ['italian-1400', 'italian-2000-0001'],
      ['italian-1700', 'italian-1700-0001'],
      ['italian-2000', 'italian-2000-0001'],
      ['caro-kann-1100', undefined],
    ]);
  });

  it("builds each opening's own lessons after the tactic units, its trap lesson from the analysed traps", () => {
    const traps = [{ id: 'trap-italian-1' } as TrapGame];
    const trap: PositionRef = { set: 'italian-1400', gameId: 'trap-italian-1', ply: 7, findShare: 0.5 };
    const real = vi.mocked(trapEntry).getMockImplementation()!;
    vi.mocked(trapEntry).mockImplementation((set) => (set === 'italian-1400' ? { id: 'italian-traps', examples: [trap], drills: [] } : null));
    const candidates = new Map([
      ['italian-1400', [candidate('italian-1400', 1, 0.5, CLEAN, 'italian-centre'), candidate('italian-1400', 2, 0.5), candidate('italian-1400', 3, 0.5, CLEAN, 'caro-kann-c5')]],
      ['caro-kann-1100', [candidate('caro-kann-1100', 1, 0.5, CLEAN, 'caro-kann-c5')]],
    ]);
    const courses = buildCourses(candidates, traps);
    expect(courses.get('italian-1400')!.units.map((u) => u.id)).toEqual(['fork', 'italian-centre', 'italian-traps']);
    expect(courses.get('caro-kann-1100')!.units.map((u) => u.id)).toEqual(['caro-kann-c5']);
    expect(trapEntry).toHaveBeenCalledWith('italian-1400', 'italian', traps);
    expect(trapEntry).toHaveBeenCalledWith('caro-kann-1100', 'caro-kann', traps);
    vi.mocked(trapEntry).mockImplementation(real);
  });

  it('refuses a folder that is not a set', () => {
    expect(() => buildCourses(new Map([['italian', []]]))).toThrow();
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

describe('pickExample', () => {
  it('shows the first example that loads, or none', async () => {
    const [entry] = course([1, 2, 3], []).units;
    expect((await pickExample(entry, fakeSource({ broken: [1] }).source))!.ref.ply).toBe(2);
    expect(await pickExample(entry, fakeSource({ broken: [1, 2, 3] }).source)).toBeNull();
  });
});

describe('pickPractice', () => {
  it('asks fresh positions first, loading no more than it needs', async () => {
    const { source, loads } = fakeSource({ seen: [10, 11] });
    const drills = await pickPractice([10, 11, 12, 13, 14, 15, 16, 17].map(ref), 4, source);
    expect(plies(drills)).toEqual([12, 13, 14, 15]);
    expect(loads).toEqual([12, 13, 14, 15]);
  });

  it('skips positions that do not load and falls back to ones seen before', async () => {
    const { source } = fakeSource({ seen: [10, 11, 12], broken: [13] });
    expect(plies(await pickPractice([10, 11, 12, 13, 14].map(ref), 4, source))).toEqual([14, 10, 11, 12]);
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
    const { openLesson } = await import('./open');
    const file: CourseFile = {
      v: 1,
      opening: 'italian',
      level: 1400,
      units: [{ id: 'free-piece', examples: [at(1, 19)], drills: [at(1, 3), at(3, 13), at(3, 7), at(2, 3)] }],
    };
    const lesson = await openLesson(file, 'free-piece', undefined, false);
    expect(lesson!.example.ref).toEqual(at(1, 19));
    expect(lesson!.drills.map((p) => positionKey(p.ref))).toEqual([
      'italian-1400/italian-1400-0002:3',
      'italian-1400/italian-1400-0001:3',
      'italian-1400/italian-1400-0003:13',
      'italian-1400/italian-1400-0003:7',
    ]);
  });
});
