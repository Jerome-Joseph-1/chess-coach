import type { Game } from '../content/types';
import { lessonFor, type Theme, type ThemeId } from '../learn';
import type { PatternLabelProps } from './Coach';
import type { IconName } from './steps/icons';
import type { DrillTeaching } from './teaching';

const ICONS: Record<ThemeId, IconName> = {
  fork: 'p-fork',
  pin: 'p-pin',
  skewer: 'p-skewer',
  'trapped-piece': 'p-trapped',
  'discovered-attack': 'p-discovered',
  'free-piece': 'p-loose',
  'material-win': 'p-loose',
  'hanging-own': 'p-loose',
  checkmate: 'p-backrank',
  'mate-threat': 'p-backrank',
  'remove-defender': 'p-defend',
  'threat-other': 'p-defend',
  bait: 'p-defend',
  quiet: 'p-quiet',
};

/** The small drawn glyph beside a pattern's name. */
export function patternIcon(theme: Theme): IconName {
  return ICONS[theme.id];
}

/** What a pause teaches: the chip over the question and the answer, why the move works, and the takeaway. */
export interface PauseLesson {
  pattern: PatternLabelProps;
  idea: string;
  remember: string;
}

/** The tactic the position shows, or the opening lesson's plan when practising one. */
export function pauseLesson(game: Game, turnIndex: number, teaching?: DrillTeaching): PauseLesson {
  if (teaching) return { pattern: { name: teaching.name, icon: teaching.icon }, idea: teaching.idea, remember: teaching.remember };
  const lesson = lessonFor(game, turnIndex);
  return { pattern: { name: lesson.name, icon: patternIcon(lesson.theme) }, idea: lesson.idea, remember: lesson.remember };
}
