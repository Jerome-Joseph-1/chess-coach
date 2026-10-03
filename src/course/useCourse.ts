import { useEffect, useState } from 'preact/hooks';
import { loadCourse, setKey } from '../content/loader';
import type { Level, OpeningId } from '../content/types';
import { gamesPlayedSince, getLessons } from '../progress/store';
import { lastLessonAt } from './path';
import type { CourseFile } from './types';

// Courses read this session, by set; a failed read is not kept, so it is tried again next time.
const known = new Map<string, CourseFile | null>();

async function readCourse(opening: OpeningId, level: Level): Promise<CourseFile | null> {
  try {
    const course = await loadCourse(opening, level);
    known.set(setKey(opening, level), course);
    return course;
  } catch {
    return null;
  }
}

/** The set's course: undefined while it loads, null when the set has none or it cannot be read. */
export function useCourse(opening: OpeningId, level: Level): CourseFile | null | undefined {
  const key = setKey(opening, level);
  const [read, setRead] = useState<{ key: string; course: CourseFile | null } | null>(null);
  useEffect(() => {
    if (known.has(key)) return;
    let current = true;
    readCourse(opening, level).then((course) => current && setRead({ key, course }));
    return () => {
      current = false;
    };
  }, [key]);
  if (known.has(key)) return known.get(key);
  return read?.key === key ? read.course : undefined;
}

export function gamesSinceLastLesson(opening: OpeningId): number {
  return gamesPlayedSince(opening, lastLessonAt(getLessons(opening)) ?? 0);
}
