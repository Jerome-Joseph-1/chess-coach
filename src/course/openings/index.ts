import type { OpeningId } from '../../content/types';
import { OPENING_LESSON_IDS, type OpeningLessonId } from '../types';
import { PLAN_LESSONS } from './plans';
import { TRAP_LESSONS } from './traps';
import type { OpeningLesson } from './types';

export const OPENING_LESSONS: Record<OpeningLessonId, OpeningLesson> = { ...PLAN_LESSONS, ...TRAP_LESSONS };

/** An opening's own lessons, in the order they are taught. */
export function openingLessonsOf(opening: OpeningId): OpeningLesson[] {
  return OPENING_LESSON_IDS[opening].map((id) => OPENING_LESSONS[id]);
}

export type { OpeningLesson, PlanLesson, TrapLesson, TrapGame } from './types';
