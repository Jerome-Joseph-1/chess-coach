import type { Chess, Move } from 'chess.js';
import type { Game, OpeningId } from '../../content/types';
import type { IconName as PatternIcon } from '../../pause/steps/icons';
import type { IconName as ListIcon } from '../../screens/shared/icons';
import type { OpeningLessonId } from '../types';

/** Texts every opening lesson shows, for beginners: plain words, moves in words where they stand alone. */
export interface LessonTexts {
  title: string;
  /** One plain line under the title on the Course tab. */
  line: string;
  /** What the lesson is about, in two short sentences. */
  intro: string;
  /** How to use it over the board. */
  spot: string[];
  /** Heading over `spot`; "How to spot it" when absent. */
  spotTitle?: string;
  /** The chip over a practice question. */
  name: string;
  /** The first hint: the plan in one line. Must hold in every practice position. */
  hint: string;
  /** Said once the move is found. Must hold in every practice position. */
  idea: string;
  remember: string;
  ask?: string;
  /** Said to another good move in practice. */
  offPlan?: string;
}

/** Which of a game's user moves carry out a plan. */
export interface PlanRule {
  /** The last move number a position may come from. */
  byMove: number;
  /** The plan step `move` carries out from `board` (the position before it), e.g. "d4"; null when it doesn't fit. */
  fits(move: Move, board: Chess): string | null;
  /** Whether the worked example's text holds for this move: textbook facts beyond what `fits` guarantees. */
  textbook(move: Move, board: Chess): boolean;
}

interface Base extends LessonTexts {
  id: OpeningLessonId;
  opening: OpeningId;
  /** The chip's icon. */
  icon: PatternIcon;
  /** The icon on the Course tab and the lesson intro. */
  listIcon: ListIcon;
}

export interface PlanLesson extends Base {
  kind: 'plan';
  plan: PlanRule;
  /** The worked example's "why" line for a plan step, by the step `fits` returned. */
  why: (step: string) => string;
}

export interface TrapLesson extends Base {
  kind: 'traps';
}

export type OpeningLesson = PlanLesson | TrapLesson;

/** A curated trap position, analysed by pipeline/traps.py: a one-turn game from the initial position. */
export interface TrapGame extends Omit<Game, 'level'> {
  lesson: OpeningLessonId;
  /** The worked example, or a practice position. */
  role: 'example' | 'drill';
}
