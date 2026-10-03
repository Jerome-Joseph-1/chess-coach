import { describe, expect, it } from 'vitest';
import { courseUnits, drillScore, gamesUntilLesson, lastLessonAt, nextStep, nextUnit, unitRows } from './path';
import type { CourseFile, LessonRecord, Lessons, UnitEntry, UnitId } from './types';

const REF = { set: 'italian-1400', gameId: 'italian-1400-0001', ply: 3, findShare: 0.5 };

function unit(id: UnitId, examples = 1): UnitEntry {
  return { id, examples: Array.from({ length: examples }, () => REF), drills: [REF] };
}

// Stored out of order, with a unit that has no worked example.
const course: CourseFile = { v: 1, opening: 'italian', level: 1400, units: [unit('pin'), unit('fork'), unit('free-piece'), unit('skewer', 0)] };

const done = (doneAt: number, drills: LessonRecord['drills'] = []): LessonRecord => ({ learnedAt: doneAt - 1, doneAt, drills });

describe('courseUnits', () => {
  it('lists the units with an example in teaching order', () => {
    expect(courseUnits(course)).toEqual(['free-piece', 'fork', 'pin']);
    expect(courseUnits(null)).toEqual([]);
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
