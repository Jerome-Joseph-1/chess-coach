import type { Level, OpeningId } from '../content/types';

/** The course's units, one pattern each, in the order they are taught. */
export const UNIT_IDS = [
  'free-piece',
  'piece-in-danger',
  'fork',
  'pin',
  'checkmate',
  'remove-defender',
  'discovered',
  'skewer',
  'trapped',
  'traps',
  'threats',
] as const;

export type UnitId = (typeof UNIT_IDS)[number];

/** A key position of a game: the turn of `gameId` whose user move is at `ply`, in the set `set` (e.g. "italian-1400"). */
export interface PositionRef {
  set: string;
  gameId: string;
  ply: number;
  /** Share of players 200 points stronger who find the move; higher is easier. */
  findShare: number;
}

export interface UnitEntry {
  id: UnitId;
  /** Worked-example candidates, clearest first; the lesson shows the first one that loads. */
  examples: PositionRef[];
  /** Practice candidates, easiest first; the lesson takes the first ones whose game the user has not played. */
  drills: PositionRef[];
}

/** content/{set}/course.json, written at deploy by scripts/build-course.ts from the set's games. */
export interface CourseFile {
  v: 1;
  opening: OpeningId;
  level: Level;
  units: UnitEntry[];
}

/** What Today offers next: a unit's lesson, or a game. */
export type PathStep = { kind: 'lesson'; unit: UnitId } | { kind: 'game' };

/** One practice position answered in a lesson. `key` is "set/gameId:ply". */
export interface DrillResult {
  key: string;
  correct: boolean;
  at: number;
}

export interface LessonRecord {
  /** The intro and worked example were seen. */
  learnedAt?: number;
  /** The practice positions were finished. */
  doneAt?: number;
  drills: DrillResult[];
}

export type Lessons = Partial<Record<UnitId, LessonRecord>>;

/** How many practice positions a lesson asks. */
export const DRILLS_PER_LESSON = 4;
/** Games to play after a lesson before the next one is offered. */
export const GAMES_BETWEEN_LESSONS = 2;

export function positionKey(ref: Pick<PositionRef, 'set' | 'gameId' | 'ply'>): string {
  return `${ref.set}/${ref.gameId}:${ref.ply}`;
}
