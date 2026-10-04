import { lessonFor } from '../../learn';
import type { Beat } from '../../learn/walkthrough';
import type { DrillTeaching } from '../../pause/teaching';
import { OPENING_LESSONS } from '../openings';
import { openingBeats, openingLessonAt, teachingFor } from '../openings/teach';
import type { LessonPosition } from '../select';
import { isOpeningLessonId, type LessonId, type OpeningLessonId } from '../types';
import type { ExampleLabel } from './Example';

/** An opening lesson's own worked example: its beats, and its chip and takeaway. */
export interface OpeningExample {
  beats: Beat[];
  label: ExampleLabel;
}

/** The worked example of an opening lesson on this position; null for a tactic lesson, or to fall back to its walkthrough. */
export function openingExample(lesson: LessonId, { game, turnIndex }: LessonPosition): OpeningExample | null {
  if (!isOpeningLessonId(lesson)) return null;
  const beats = openingBeats(lesson, game, turnIndex);
  if (!beats) return null;
  const { name, icon, remember } = OPENING_LESSONS[lesson];
  return { beats, label: { name, icon, remember } };
}

/** What an opening lesson's practice position says and accepts; undefined for a tactic lesson or a position it doesn't fit. */
export function practiceTeaching(lesson: LessonId, { game, turnIndex }: LessonPosition): DrillTeaching | undefined {
  if (!isOpeningLessonId(lesson)) return undefined;
  return teachingFor(lesson, game, turnIndex) ?? undefined;
}

/** The opening lesson a reviewed practice position belongs to, with its teaching; null for a tactic position. */
export function reviewLesson(position: LessonPosition): { lesson: OpeningLessonId; teaching: DrillTeaching } | null {
  const lesson = openingLessonAt(position.game, position.turnIndex);
  const teaching = lesson && practiceTeaching(lesson, position);
  return lesson && teaching ? { lesson, teaching } : null;
}

/** The takeaway the summary ends on: the opening lesson's, or the tactic the worked example shows. */
export function lessonRemember(lesson: LessonId, { game, turnIndex }: LessonPosition): string {
  return isOpeningLessonId(lesson) ? OPENING_LESSONS[lesson].remember : lessonFor(game, turnIndex).remember;
}
