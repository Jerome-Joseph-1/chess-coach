// Where a lesson opens: at the start, or back on the page the user left.
import { deviceSource, pickExample, pickPractice, type LessonPosition, type PositionSource } from './select';
import { DRILLS_PER_LESSON, type CourseFile, type DrillResult, type LessonRecord, type PositionRef, type UnitId } from './types';

export type LessonStage = 'intro' | 'example' | 'practice' | 'summary';

/** A practice position answered in this lesson; right means found without a hint. */
export interface Answer {
  position: LessonPosition;
  correct: boolean;
}

export interface OpenedLesson {
  stage: LessonStage;
  example: LessonPosition;
  /** The practice positions still to ask. */
  drills: LessonPosition[];
  /** Practice answered before the user left the lesson. */
  answers: Answer[];
}

/** "italian-1400/italian-1400-0007:21" read back into the position it names. */
export function refOfKey(key: string): PositionRef {
  const [set, rest = ''] = key.split('/');
  const [gameId, ply] = rest.split(':');
  return { set, gameId, ply: Number(ply), findShare: 0 };
}

/** The positions behind these keys that still load, in order. */
async function loadKeys(keys: string[], source: PositionSource): Promise<LessonPosition[]> {
  const loaded = await Promise.all(keys.map((key) => source.load(refOfKey(key))));
  return loaded.filter((position) => position !== null);
}

async function loadAnswers(given: DrillResult[], source: PositionSource): Promise<Answer[]> {
  const loaded = await Promise.all(given.map((d) => source.load(refOfKey(d.key))));
  return given.flatMap((d, i) => (loaded[i] ? [{ position: loaded[i], correct: d.correct }] : []));
}

/** The practice the user left: what was answered since it began, then the rest of its positions. */
async function resumePractice(record: LessonRecord, since: number, keys: string[], source: PositionSource) {
  const given = record.drills.filter((d) => d.at >= since && keys.includes(d.key));
  const answered = new Set(given.map((d) => d.key));
  const [answers, drills] = await Promise.all([loadAnswers(given, source), loadKeys(keys.filter((key) => !answered.has(key)), source)]);
  return { answers, drills };
}

/**
 * The lesson to show: on the page the user left, with the practice answered there kept, or at the intro.
 * Null when the unit or its example is missing.
 */
export async function openLesson(
  course: CourseFile,
  unit: UnitId,
  record: LessonRecord | undefined,
  source = deviceSource(course.opening, unit),
): Promise<OpenedLesson | null> {
  const entry = course.units.find((u) => u.id === unit);
  const example = entry && (await pickExample(entry, source));
  if (!example) return null;
  const place = record?.place;
  if (place?.page === 'practice') {
    const { answers, drills } = await resumePractice(record!, place.since, place.drills, source);
    return { stage: drills.length > 0 ? 'practice' : 'summary', example, drills, answers };
  }
  const drills = await pickPractice(entry.drills, DRILLS_PER_LESSON, source);
  return { stage: place ? 'example' : 'intro', example, drills, answers: [] };
}
