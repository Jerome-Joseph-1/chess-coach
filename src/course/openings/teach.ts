import type { Game } from '../../content/types';
import type { Beat } from '../../learn/walkthrough';
import type { DrillTeaching } from '../../pause/teaching';
import type { OpeningLessonId } from '../types';

/** The opening lesson a practice position belongs to, from the game and turn alone; null for a tactic position. */
export function openingLessonAt(_game: Game, _turnIndex: number): OpeningLessonId | null {
  return null;
}

/** What a practice position of an opening lesson says and accepts; null for a turn the lesson doesn't fit. */
export function teachingFor(_lesson: OpeningLessonId, _game: Game, _turnIndex: number): DrillTeaching | null {
  return null;
}

/** The worked example of an opening lesson on this turn; null to fall back to the tactic walkthrough. */
export function openingBeats(_lesson: OpeningLessonId, _game: Game, _turnIndex: number): Beat[] | null {
  return null;
}
