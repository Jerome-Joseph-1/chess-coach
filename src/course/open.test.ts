import { describe, expect, it } from 'vitest';
import type { Game } from '../content/types';
import { openLesson, refOfKey } from './open';
import type { LessonPosition, PositionSource } from './select';
import { positionKey, type CourseFile, type LessonRecord, type PositionRef } from './types';

const ref = (ply: number): PositionRef => ({ set: 'italian-1400', gameId: `g${ply}`, ply, findShare: 0 });
const key = (ply: number) => positionKey(ref(ply));

const source: PositionSource = {
  load: async (r) => ({ ref: r, game: {} as Game, turnIndex: 0 }) satisfies LessonPosition,
  seen: () => false,
};

const course: CourseFile = {
  v: 1,
  opening: 'italian',
  level: 1400,
  units: [{ id: 'fork', examples: [ref(1)], drills: [10, 11, 12, 13, 14, 15].map(ref) }],
};

const plies = (positions: LessonPosition[]) => positions.map((p) => p.ref.ply);

function record(place: LessonRecord['place'], answered: [ply: number, correct: boolean, at: number][] = []): LessonRecord {
  return { place, drills: answered.map(([ply, correct, at]) => ({ key: key(ply), correct, at })) };
}

describe('openLesson', () => {
  it('starts a new lesson at the intro with four practice positions', async () => {
    const lesson = await openLesson(course, 'fork', undefined, source);
    expect(lesson).toMatchObject({ stage: 'intro', answers: [] });
    expect(lesson!.example.ref.ply).toBe(1);
    expect(plies(lesson!.drills)).toEqual([10, 11, 12, 13]);
  });

  it('opens on the worked example the user left', async () => {
    expect((await openLesson(course, 'fork', record({ page: 'example' }), source))!.stage).toBe('example');
  });

  it('resumes practice on the positions it began with, keeping the answers given since', async () => {
    // 11 was also answered in an earlier lesson, which does not count here.
    const practice = { page: 'practice' as const, since: 100, drills: [11, 12, 13, 14].map(key) };
    const left = record(practice, [[11, false, 50], [11, true, 100], [12, false, 120]]);
    const lesson = await openLesson(course, 'fork', left, source);
    expect(lesson!.stage).toBe('practice');
    expect(lesson!.answers.map((a) => [a.position.ref.ply, a.correct])).toEqual([[11, true], [12, false]]);
    expect(plies(lesson!.drills)).toEqual([13, 14]);
  });

  it('goes to the summary when every practice position was answered before the user left', async () => {
    const practice = { page: 'practice' as const, since: 100, drills: [10, 11, 12, 13].map(key) };
    const left = record(practice, [[10, true, 100], [11, true, 101], [12, true, 102], [13, false, 103]]);
    const lesson = await openLesson(course, 'fork', left, source);
    expect(lesson).toMatchObject({ stage: 'summary', drills: [] });
    expect(lesson!.answers).toHaveLength(4);
  });

  it('gives nothing without the unit or an example that loads', async () => {
    expect(await openLesson(course, 'pin', undefined, source)).toBeNull();
    expect(await openLesson(course, 'fork', undefined, { ...source, load: async () => null })).toBeNull();
  });
});

describe('refOfKey', () => {
  it('reads back the position a stored answer names', () => {
    expect(refOfKey('italian-1400/italian-1400-0007:21')).toEqual({ set: 'italian-1400', gameId: 'italian-1400-0007', ply: 21, findShare: 0 });
  });
});
