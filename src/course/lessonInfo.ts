import type { IconName } from '../screens/shared/icons';
import { UNIT_ICONS } from '../screens/shared/unitIcons';
import { INTROS } from './lesson/intros';
import { OPENING_LESSONS } from './openings';
import { isOpeningLessonId, type LessonId } from './types';
import { UNITS } from './units';

export interface LessonInfo {
  title: string;
  line: string;
  icon: IconName;
  intro: string;
  spot: string[];
  /** Heading over `spot`. */
  spotTitle: string;
}

/** What the Course tab, Today and the lesson intro show for a lesson of either kind. */
export function lessonInfo(id: LessonId): LessonInfo {
  if (isOpeningLessonId(id)) {
    const { title, line, listIcon, intro, spot, spotTitle } = OPENING_LESSONS[id];
    return { title, line, icon: listIcon, intro, spot, spotTitle: spotTitle ?? 'How to spot it' };
  }
  return { ...UNITS[id], icon: UNIT_ICONS[id], ...INTROS[id], spotTitle: 'How to spot it' };
}
