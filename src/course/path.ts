import {
  DRILLS_PER_LESSON,
  GAMES_BETWEEN_LESSONS,
  UNIT_IDS,
  positionKey,
  type CourseFile,
  type LessonRecord,
  type Lessons,
  type PathStep,
  type PositionRef,
  type UnitId,
} from './types';

export type UnitStatus = 'done' | 'next' | 'later';

export interface Score {
  right: number;
  total: number;
}

export interface UnitRow {
  id: UnitId;
  status: UnitStatus;
  /** Practice right at the first try, for a done lesson. */
  score: Score | null;
}

/** The units the course can teach, those with a worked example, in teaching order. */
export function courseUnits(course: CourseFile | null): UnitId[] {
  if (!course) return [];
  return UNIT_IDS.filter((id) => course.units.some((u) => u.id === id && u.examples.length > 0));
}

const isDone = (lessons: Lessons, unit: UnitId) => lessons[unit]?.doneAt !== undefined;

/** The first unit of the course whose lesson is not done. */
export function nextUnit(course: CourseFile | null, lessons: Lessons): UnitId | null {
  return courseUnits(course).find((id) => !isDone(lessons, id)) ?? null;
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
export function unansweredDrills(course: CourseFile | null, unit: UnitId, record: LessonRecord | undefined): PositionRef[] {
  const answered = new Set(record?.drills.map((d) => d.key));
  const drills = course?.units.find((u) => u.id === unit)?.drills ?? [];
  return drills.filter((ref) => !answered.has(positionKey(ref)));
}

/** How many new practice positions the unit offers in one more round: up to a lesson's worth, none once all are answered. */
export function morePractice(course: CourseFile | null, unit: UnitId, record: LessonRecord | undefined): number {
  return Math.min(DRILLS_PER_LESSON, unansweredDrills(course, unit, record).length);
}

/** Each unit of the course with where it stands: done with its score, the next one, or later. */
export function unitRows(course: CourseFile | null, lessons: Lessons): UnitRow[] {
  const next = nextUnit(course, lessons);
  return courseUnits(course).map((id) => {
    const record = lessons[id];
    if (record && isDone(lessons, id)) return { id, status: 'done', score: drillScore(record) };
    return { id, status: id === next ? 'next' : 'later', score: null };
  });
}
