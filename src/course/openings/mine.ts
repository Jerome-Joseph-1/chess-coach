// Finds the positions that teach a plan lesson among a game's own moves.
import { Chess, type Move } from 'chess.js';
import type { Game, OpeningId, Turn } from '../../content/types';
import { uciOf } from '../../learn/board';
import { nameAt, variationAt } from '../../opening';
import type { Candidate } from '../select';
import { positionKey, type PositionRef } from '../types';
import { openingLessonsOf } from './index';
import type { PlanLesson } from './types';

/** The most win% a plan move may lose against the best move and still count as found. */
export const PLAN_GRADE = 2.5;
/** Win% by which the plan move must beat every other move for a sound position, unless it is the usual move. */
const SOUND_GAP = 1.5;
/** Win% by which a clear example's plan move beats every other move. */
const CLEAR_GAP = 3;
/** Win% within which another move counts as about as good. */
const CLOSE_GAP = 2;
/** Share of players at the level who play the plan move for it to be the usual move. */
const TYPICAL_SHARE = 0.4;

/** Positions the Stockfish check (pipeline/check_lessons.py) turned down, by position key. */
export const EXCLUDE = new Set<string>([]);

/** A turn's scripted move with the board it is played on. */
export interface Scripted {
  board: Chess;
  move: Move;
}

/** What makes a plan position a clear worked example. */
export interface PlanFacts {
  /** The worked example's text holds here. */
  textbook: boolean;
  /** Win% by which the plan move beats the best other move. */
  gap: number;
  /** It is what players at the level play most, by a clear share. */
  typical: boolean;
  material: number;
}

// Most important first, as for the tactic examples.
const EXAMPLE_RULES: ((facts: PlanFacts) => boolean)[] = [
  (f) => f.textbook,
  (f) => f.gap >= CLEAR_GAP,
  (f) => f.typical,
  (f) => f.material === 0,
];

export const PLAN_CLEAN = EXAMPLE_RULES.length;

export function planClarity(facts: PlanFacts): number {
  const failed = EXAMPLE_RULES.findIndex((rule) => !rule(facts));
  return failed < 0 ? PLAN_CLEAN : failed;
}

/** The opening's plan lessons, in the order that claims a position first. */
export function planLessonsOf(opening: OpeningId): PlanLesson[] {
  return openingLessonsOf(opening).filter((lesson): lesson is PlanLesson => lesson.kind === 'plan');
}

/** The turn's scripted move, on the board before it; null when the move is not legal there. */
export function scriptedMove(game: Game, turn: Turn): Scripted | null {
  const board = new Chess(turn.fen);
  const move = board.moves({ verbose: true }).find((m) => m.san === game.moves[turn.ply]);
  return move ? { board, move } : null;
}

/** The plan lesson a quiet turn's scripted move carries out: the first one it fits by that lesson's last move. */
export function planLessonAt(game: Game, turnIndex: number): PlanLesson | null {
  const turn = game.turns[turnIndex];
  if (!turn || turn.label === 'critical' || turn.inCheck) return null;
  const lessons = planLessonsOf(game.opening).filter((lesson) => turn.moveNo <= lesson.plan.byMove);
  const played = lessons.length > 0 ? scriptedMove(game, turn) : null;
  if (!played) return null;
  return lessons.find((lesson) => lesson.plan.fits(played.move, played.board) !== null) ?? null;
}

const isGood = (turn: Turn, uci: string) => (turn.grades[uci] ?? Infinity) <= PLAN_GRADE;

/** The moves of a turn that carry out the lesson's plan and lose next to nothing, as uci. */
export function planMoves(lesson: PlanLesson, turn: Turn): string[] {
  const board = new Chess(turn.fen);
  return board
    .moves({ verbose: true })
    .filter((m) => isGood(turn, uciOf(m)) && lesson.plan.fits(m, board) !== null)
    .map(uciOf);
}

/** How much better the scripted move is than the best graded move off the plan; Infinity when every graded move is on it. */
function gapOf(turn: Turn, plan: string[], uci: string): number {
  const others = Object.entries(turn.grades).flatMap(([move, grade]) => (plan.includes(move) ? [] : [grade]));
  return others.length ? Math.min(...others) - turn.grades[uci] : Infinity;
}

/** The move players at the level play most is a plan move, by a clear share. */
function isTypical(turn: Turn, plan: string[]): boolean {
  const top = [...turn.human].sort((a, b) => b.share - a.share)[0];
  return top !== undefined && top.share >= TYPICAL_SHARE && plan.includes(top.uci);
}

/** For each ply of the game, the deepest variation with a plan reached before it, else the opening's name. */
function familiesOf(game: Game): string[] {
  const chess = new Chess();
  game.start.forEach((san) => chess.move(san));
  let family = variationAt(chess.fen())?.id ?? nameAt(game.start)?.name ?? game.opening;
  return game.moves.map((san) => {
    const before = family;
    chess.move(san);
    family = variationAt(chess.fen())?.id ?? family;
    return before;
  });
}

function boardOf(fen: string): string {
  return fen.split(' ').slice(0, 4).join(' ');
}

/** The facts of a plan position whose scripted move fits `lesson`. */
export function planFacts(lesson: PlanLesson, turn: Turn, { board, move }: Scripted): PlanFacts & { plan: string[] } {
  const plan = planMoves(lesson, turn);
  return {
    plan,
    textbook: lesson.plan.textbook(move, board),
    gap: gapOf(turn, plan, uciOf(move)),
    typical: isTypical(turn, plan),
    material: turn.material,
  };
}

/** The game's quiet positions where the scripted move carries out a plan lesson and the engine backs it. */
export function planCandidatesOf(set: string, game: Game): Candidate[] {
  let families: string[] | null = null;
  return game.turns.flatMap((turn, index) => {
    const lesson = planLessonAt(game, index);
    const played = lesson && scriptedMove(game, turn);
    if (!lesson || !played || !isGood(turn, uciOf(played.move))) return [];
    const ref: PositionRef = { set, gameId: game.id, ply: turn.ply, findShare: turn.findShare };
    if (EXCLUDE.has(positionKey(ref))) return [];
    const facts = planFacts(lesson, turn, played);
    families ??= familiesOf(game);
    return [
      {
        ref,
        unit: lesson.id,
        position: boardOf(turn.fen),
        clarity: planClarity(facts),
        sound: facts.gap >= SOUND_GAP || facts.typical,
        tier: 0,
        contested: facts.gap < CLOSE_GAP,
        picture: `${lesson.id} ${played.move.san} ${families[turn.ply]}`,
        textbook: facts.textbook,
      },
    ];
  });
}
