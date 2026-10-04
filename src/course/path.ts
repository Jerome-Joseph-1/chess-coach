import {
  DRILLS_PER_LESSON,
  GAMES_BETWEEN_LESSONS,
  OPENING_LESSON_IDS,
  UNIT_IDS,
  positionKey,
  type CourseFile,
  type LessonId,
  type LessonRecord,
  type Lessons,
  type OpeningLessonId,
  type PathStep,
  type PositionRef,
} from './types';

/** Opening lessons sit in the lesson path; when false, they are a section of their own that is always open. */
export const OPENING_LESSONS_IN_PATH = true;

/** Tactic units taught between two opening lessons. */
const UNITS_PER_OPENING_LESSON = 2;

/** A lesson in the path is done, next or later; one in the opening section is done or open. */
export type UnitStatus = 'done' | 'next' | 'later' | 'open';

export interface Score {
  right: number;
  total: number;
}

export interface UnitRow {
  id: LessonId;
  status: UnitStatus;
  /** Practice right at the first try, for a done lesson. */
  score: Score | null;
}

function canTeach(course: CourseFile, id: LessonId): boolean {
  return course.units.some((u) => u.id === id && u.examples.length > 0);
}

/** The opening's own lessons the course can teach, in teaching order. */
function openingLessons(course: CourseFile): OpeningLessonId[] {
  const ids: readonly OpeningLessonId[] = OPENING_LESSON_IDS[course.opening];
  return ids.filter((id) => canTeach(course, id));
}

/** Each opening lesson followed by the next tactic units; the lessons left over of either kind go last. */
function interleave(openings: LessonId[], units: LessonId[]): LessonId[] {
  const n = UNITS_PER_OPENING_LESSON;
  const path = openings.flatMap((id, i) => [id, ...units.slice(i * n, (i + 1) * n)]);
  return [...path, ...units.slice(openings.length * n)];
}

/**
 * The lessons of the path, those with a worked example, in teaching order: the opening's first lesson, two tactic
 * units, its next lesson, and so on. Only the tactic units when the opening lessons are a section of their own.
 */
export function courseLessons(course: CourseFile | null, inPath = OPENING_LESSONS_IN_PATH): LessonId[] {
  if (!course) return [];
  const units = UNIT_IDS.filter((id) => canTeach(course, id));
  return inPath ? interleave(openingLessons(course), units) : units;
}

const isDone = (lessons: Lessons, unit: LessonId) => lessons[unit]?.doneAt !== undefined;

/** The first lesson of the path that is not done. */
export function nextUnit(course: CourseFile | null, lessons: Lessons): LessonId | null {
  return courseLessons(course).find((id) => !isDone(lessons, id)) ?? null;
}

/** When the last lesson was finished; null before the first one. */
export function lastLessonAt(lessons: Lessons): number | null {
  const times = Object.values(lessons).flatMap((l) => (l?.doneAt === undefined ? [] : [l.doneAt]));
  return times.length ? Math.max(...times) : null;
}

/** Games still to play before the next lesson is offered; none before the first lesson. */
export function gamesUntilLesson(lessons: Lessons, gamesSinceLastLesson: number): number {
  return lastLessonAt(lessons) === null ? 0 : Math.max(0, GAMES_BETWEEN_LESSONS - gamesSinceLastLesson);
}

/** What Today offers: the next lesson, once enough games have followed the last one, else a game. */
export function nextStep(course: CourseFile | null, lessons: Lessons, gamesSinceLastLesson: number): PathStep {
  const unit = nextUnit(course, lessons);
  return unit && gamesUntilLesson(lessons, gamesSinceLastLesson) === 0 ? { kind: 'lesson', unit } : { kind: 'game' };
}

/** Practice positions right at the first answer, out of those answered. */
export function drillScore(record: LessonRecord): Score {
  const first = new Map<string, boolean>();
  for (const drill of record.drills) if (!first.has(drill.key)) first.set(drill.key, drill.correct);
  const answers = [...first.values()];
  return { right: answers.filter(Boolean).length, total: answers.length };
}

/** The unit's practice positions the user has not answered yet. */
export function unansweredDrills(course: CourseFile | null, unit: LessonId, record: LessonRecord | undefined): PositionRef[] {
  const answered = new Set(record?.drills.map((d) => d.key));
  const drills = course?.units.find((u) => u.id === unit)?.drills ?? [];
  return drills.filter((ref) => !answered.has(positionKey(ref)));
}

/** How many new practice positions the unit offers in one more round: up to a lesson's worth, none once all are answered. */
export function morePractice(course: CourseFile | null, unit: LessonId, record: LessonRecord | undefined): number {
  return Math.min(DRILLS_PER_LESSON, unansweredDrills(course, unit, record).length);
}

/** A lesson done, with its score, or not done yet and `pending`. */
function rowOf(id: LessonId, lessons: Lessons, pending: UnitStatus): UnitRow {
  const record = lessons[id];
  return record?.doneAt !== undefined ? { id, status: 'done', score: drillScore(record) } : { id, status: pending, score: null };
}

/** Each lesson of the path with where it stands: done with its score, the next one, or later. */
export function unitRows(course: CourseFile | null, lessons: Lessons): UnitRow[] {
  const next = nextUnit(course, lessons);
  return courseLessons(course).map((id) => rowOf(id, lessons, id === next ? 'next' : 'later'));
}

/** The opening's own lessons, for the section outside the path: done with its score, or open. */
export function sectionRows(course: CourseFile | null, lessons: Lessons): UnitRow[] {
  return (course ? openingLessons(course) : []).map((id) => rowOf(id, lessons, 'open'));
}
