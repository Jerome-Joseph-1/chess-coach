import type { OpeningId } from '../../content/types';
import type { UnitId } from '../types';

export interface LessonScreenProps {
  opening: OpeningId;
  unit: UnitId;
}

/** A unit's lesson: what the pattern is, a worked example, then practice positions and a summary. */
export function LessonScreen(_props: LessonScreenProps) {
  return null;
}
