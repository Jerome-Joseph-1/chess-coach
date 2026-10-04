import type { TrapLesson } from './types';

export type TrapLessonId = 'italian-traps' | 'caro-kann-traps';

function stub(id: TrapLessonId, opening: TrapLesson['opening'], title: string): TrapLesson {
  return {
    id,
    opening,
    kind: 'traps',
    title,
    line: '',
    intro: '',
    spot: [],
    name: title,
    hint: '',
    idea: '',
    remember: '',
    icon: 'eye',
    listIcon: 'eye',
  };
}

/** The trap lessons, on curated lines analysed by pipeline/traps.py into traps.json. */
export const TRAP_LESSONS: Record<TrapLessonId, TrapLesson> = {
  'italian-traps': stub('italian-traps', 'italian', 'Italian traps'),
  'caro-kann-traps': stub('caro-kann-traps', 'caro-kann', 'Caro-Kann traps'),
};
