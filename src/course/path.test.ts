import { describe, expect, it } from 'vitest';
import { courseLessons, drillScore, gamesUntilLesson, lastLessonAt, morePractice, nextStep, nextUnit, sectionRows, unansweredDrills, unitRows } from './path';
import type { CourseFile, LessonId, LessonRecord, Lessons, UnitEntry } from './types';

const REF = { set: 'italian-1400', gameId: 'italian-1400-0001', ply: 3, findShare: 0.5 };

function unit(id: LessonId, examples = 1): UnitEntry {
  return { id, examples: Array.from({ length: examples }, () => REF), drills: [REF] };
}

const units = (...ids: LessonId[]) => ids.map((id) => unit(id));

// Stored out of order, with a unit that has no worked example.
const course: CourseFile = { v: 1, opening: 'italian', level: 1400, units: [unit('pin'), unit('fork'), unit('free-piece'), unit('skewer', 0)] };

// One opening lesson has no example and one no entry; another opening's lesson does not belong.
const openingCourse: CourseFile = {
  ...course,
  units: [
    ...units('free-piece', 'piece-in-danger', 'fork', 'pin', 'checkmate'),
    ...units('italian-idea', 'italian-slow', 'italian-traps', 'caro-kann-idea'),
    unit('italian-centre', 0),
  ],
};

const done = (doneAt: number, drills: LessonRecord['drills'] = []): LessonRecord => ({ learnedAt: doneAt - 1, doneAt, drills });

describe('courseLessons', () => {
  it('lists the units with an example in teaching order', () => {
    expect(courseLessons(course)).toEqual(['free-piece', 'fork', 'pin']);
    expect(courseLessons(null)).toEqual([]);
  });

  it("starts with the opening's first lesson and puts its next one after every two units, skipping lessons without an example", () => {
    expect(courseLessons(openingCourse)).toEqual([
      'italian-idea',
      'free-piece',
      'piece-in-danger',
      'italian-slow',
      'fork',
      'pin',
      'italian-traps',
      'checkmate',
    ]);
  });

  it('puts the opening lessons left over last when the units run out', () => {
    const few: CourseFile = { ...course, units: [unit('fork'), unit('italian-centre'), unit('italian-idea'), unit('italian-ng5')] };
    expect(courseLessons(few)).toEqual(['italian-idea', 'fork', 'italian-centre', 'italian-ng5']);
  });

  it('leaves the opening lessons out of the path when they are a section of their own', () => {
    expect(courseLessons(openingCourse, false)).toEqual(['free-piece', 'piece-in-danger', 'fork', 'pin', 'checkmate']);
  });
});

describe('nextStep', () => {
  it('offers the first lesson at once, before any game', () => {
    expect(nextStep(course, {}, 0)).toEqual({ kind: 'lesson', unit: 'free-piece' });
  });

  it('offers games until two have followed the last lesson, then the next lesson', () => {
    const lessons: Lessons = { 'free-piece': done(100) };
    expect(nextStep(course, lessons, 0)).toEqual({ kind: 'game' });
    expect(nextStep(course, lessons, 1)).toEqual({ kind: 'game' });
    expect(nextStep(course, lessons, 2)).toEqual({ kind: 'lesson', unit: 'fork' });
    expect(nextStep(course, lessons, 5)).toEqual({ kind: 'lesson', unit: 'fork' });
  });

  it('keeps offering a lesson that was started but not finished', () => {
    expect(nextStep(course, { 'free-piece': { learnedAt: 100, drills: [] } }, 0)).toEqual({ kind: 'lesson', unit: 'free-piece' });
  });

  it('skips units the course cannot teach and lessons done out of order', () => {
    const lessons: Lessons = { 'free-piece': done(100), pin: done(200), skewer: done(300) };
    expect(nextStep(course, lessons, 2)).toEqual({ kind: 'lesson', unit: 'fork' });
  });

  it('offers a game once every lesson is done, or when there is no course', () => {
    const lessons: Lessons = { 'free-piece': done(100), fork: done(200), pin: done(300) };
    expect(nextStep(course, lessons, 9)).toEqual({ kind: 'game' });
    expect(nextStep(null, {}, 0)).toEqual({ kind: 'game' });
  });
});

describe('lastLessonAt and gamesUntilLesson', () => {
  it('count from the lesson finished last', () => {
    const lessons: Lessons = { fork: done(300), 'free-piece': done(100), pin: { learnedAt: 400, drills: [] } };
    expect(lastLessonAt(lessons)).toBe(300);
    expect(lastLessonAt({})).toBeNull();
    expect(gamesUntilLesson(lessons, 0)).toBe(2);
    expect(gamesUntilLesson(lessons, 1)).toBe(1);
    expect(gamesUntilLesson(lessons, 3)).toBe(0);
    expect(gamesUntilLesson({}, 0)).toBe(0);
  });
});

describe('drillScore', () => {
  it('counts each position by its first answer', () => {
    const record = done(10, [
      { key: 'a', correct: false, at: 1 },
      { key: 'a', correct: true, at: 2 },
      { key: 'b', correct: true, at: 3 },
      { key: 'c', correct: true, at: 4 },
    ]);
    expect(drillScore(record)).toEqual({ right: 2, total: 3 });
    expect(drillScore({ drills: [] })).toEqual({ right: 0, total: 0 });
  });
});

describe('unitRows', () => {
  it('marks done units with their score, the next one, and the rest as later', () => {
    const lessons: Lessons = { fork: done(100, [{ key: 'x', correct: true, at: 1 }]) };
    expect(nextUnit(course, lessons)).toBe('free-piece');
    expect(unitRows(course, lessons)).toEqual([
      { id: 'free-piece', status: 'next', score: null },
      { id: 'fork', status: 'done', score: { right: 1, total: 1 } },
      { id: 'pin', status: 'later', score: null },
    ]);
  });

  it('has no next unit once all are done', () => {
    const lessons: Lessons = { 'free-piece': done(1), fork: done(2), pin: done(3) };
    expect(unitRows(course, lessons).map((r) => r.status)).toEqual(['done', 'done', 'done']);
  });
});

describe('more practice', () => {
  const ref = (ply: number) => ({ ...REF, ply });
  const withDrills: CourseFile = { ...course, units: [{ id: 'fork', examples: [REF], drills: [1, 3, 5, 7, 9, 11].map(ref) }] };
  const answered = (...plies: number[]) => done(100, plies.map((ply) => ({ key: `italian-1400/italian-1400-0001:${ply}`, correct: false, at: 50 })));

  it('offers the practice positions not answered yet, up to a lesson at a time', () => {
    expect(unansweredDrills(withDrills, 'fork', answered(1, 5)).map((r) => r.ply)).toEqual([3, 7, 9, 11]);
    expect(morePractice(withDrills, 'fork', answered(1))).toBe(4);
    expect(morePractice(withDrills, 'fork', answered(1, 3, 5))).toBe(3);
  });

  it('offers none once every one is answered, or without the unit', () => {
    expect(morePractice(withDrills, 'fork', answered(1, 3, 5, 7, 9, 11))).toBe(0);
    expect(morePractice(withDrills, 'pin', undefined)).toBe(0);
    expect(morePractice(null, 'fork', undefined)).toBe(0);
  });
});

describe('opening lessons for someone who started before them', () => {
  const lessons: Lessons = { 'free-piece': done(100), 'piece-in-danger': done(200), fork: done(300) };

  it('keeps the tactic lessons done and offers the first opening lesson next', () => {
    expect(nextStep(openingCourse, lessons, 2)).toEqual({ kind: 'lesson', unit: 'italian-idea' });
    expect(unitRows(openingCourse, lessons).map((r) => [r.id, r.status])).toEqual([
      ['italian-idea', 'next'],
      ['free-piece', 'done'],
      ['piece-in-danger', 'done'],
      ['italian-slow', 'later'],
      ['fork', 'done'],
      ['pin', 'later'],
      ['italian-traps', 'later'],
      ['checkmate', 'later'],
    ]);
  });

  it('then offers the next opening lesson, two games later', () => {
    const more: Lessons = { ...lessons, 'italian-idea': done(400) };
    expect(nextStep(openingCourse, more, 1)).toEqual({ kind: 'game' });
    expect(nextStep(openingCourse, more, 2)).toEqual({ kind: 'lesson', unit: 'italian-slow' });
  });
});

describe('sectionRows', () => {
  it("lists the opening's lessons with an example, done with a score or open", () => {
    const lessons: Lessons = { 'italian-slow': done(100, [{ key: 'x', correct: true, at: 1 }]), 'italian-idea': { learnedAt: 50, drills: [] } };
    expect(sectionRows(openingCourse, lessons)).toEqual([
      { id: 'italian-idea', status: 'open', score: null },
      { id: 'italian-slow', status: 'done', score: { right: 1, total: 1 } },
      { id: 'italian-traps', status: 'open', score: null },
    ]);
    expect(sectionRows(null, lessons)).toEqual([]);
  });
});
