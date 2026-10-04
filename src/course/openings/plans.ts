import type { OpeningLessonId } from '../types';
import type { PlanLesson } from './types';

export type PlanLessonId = Exclude<OpeningLessonId, 'italian-traps' | 'caro-kann-traps'>;

/** Placeholder rule until the plan's own predicates are written. */
const NONE = { byMove: 0, fits: () => null, textbook: () => false };

function stub(id: PlanLessonId, opening: PlanLesson['opening'], title: string): PlanLesson {
  return {
    id,
    opening,
    kind: 'plan',
    title,
    line: '',
    intro: '',
    spot: [],
    name: title,
    hint: '',
    idea: '',
    remember: '',
    icon: 'p-quiet',
    listIcon: 'quiet',
    plan: NONE,
    why: () => '',
  };
}

/** The plan lessons, mined from the games' own moves. */
export const PLAN_LESSONS: Record<PlanLessonId, PlanLesson> = {
  'italian-idea': stub('italian-idea', 'italian', 'The Italian idea'),
  'italian-centre': stub('italian-centre', 'italian', 'Build the centre'),
  'italian-slow': stub('italian-slow', 'italian', 'The slow plan'),
  'italian-ng5': stub('italian-ng5', 'italian', 'Ng5 against f7'),
  'caro-kann-idea': stub('caro-kann-idea', 'caro-kann', 'The Caro-Kann idea'),
  'caro-kann-bishop': stub('caro-kann-bishop', 'caro-kann', 'Your light bishop first'),
  'caro-kann-c5': stub('caro-kann-c5', 'caro-kann', 'The c5 break'),
  'caro-kann-exchange': stub('caro-kann-exchange', 'caro-kann', 'The Exchange structure'),
};
