import { Chess, type Move, type Square } from 'chess.js';
import { NAME, VALUE } from '../../board/captions';
import type { Game, OpeningId, Turn } from '../../content/types';
import { uciOf } from '../../learn/board';
import type { Beat } from '../../learn/walkthrough';
import type { DrillTeaching } from '../../pause/teaching';
import { OPENING_LESSON_IDS, type OpeningLessonId } from '../types';
import { OPENING_LESSONS } from './index';
import { PLAN_GRADE, planLessonAt, planMoves, scriptedMove } from './mine';
import { trapBeats } from './trapBeats';
import type { OpeningLesson, PlanLesson, TrapGame, TrapLesson } from './types';

/** Enemy pieces the why step points at, at most. */
const MAX_TARGETS = 2;

function trapLessonOf(opening: OpeningId): OpeningLessonId | null {
  return OPENING_LESSON_IDS[opening].find((id) => OPENING_LESSONS[id].kind === 'traps') ?? null;
}

/** The opening lesson a practice position belongs to, from the game and turn alone; null for a tactic position. */
export function openingLessonAt(game: Game, turnIndex: number): OpeningLessonId | null {
  if (game.id.startsWith('trap-')) return (game as Partial<TrapGame>).lesson ?? trapLessonOf(game.opening);
  return planLessonAt(game, turnIndex)?.id ?? null;
}

function texts({ name, icon, hint, idea, remember, ask }: OpeningLesson): Omit<DrillTeaching, 'planMoves'> {
  return { name, icon, hint, idea, remember, ...(ask ? { ask } : {}) };
}

/** Every analysed move that loses next to nothing, as uci. */
function goodMoves(turn: Turn): string[] {
  return Object.entries(turn.grades).flatMap(([uci, grade]) => (grade <= PLAN_GRADE ? [uci] : []));
}

/** A trap position's practice: its own name, question and reason over the lesson's, and every move that holds counts. */
function trapTeaching(lesson: TrapLesson, game: Game, turn: Turn): DrillTeaching | null {
  const { title, ask, why } = game as Partial<TrapGame>;
  const moves = goodMoves(turn);
  if (!moves.length) return null;
  const line = turn.lines.best;
  return { ...texts(lesson), name: title ?? lesson.name, idea: why ?? lesson.idea, ...(ask ? { ask } : {}), planMoves: moves, ...(line ? { line } : {}) };
}

/** What a practice position of an opening lesson says and accepts; null for a turn the lesson doesn't fit. */
export function teachingFor(lesson: OpeningLessonId, game: Game, turnIndex: number): DrillTeaching | null {
  const info = OPENING_LESSONS[lesson];
  const turn = game.turns[turnIndex];
  if (!turn) return null;
  if (info.kind === 'traps') return trapTeaching(info, game, turn);
  const played = scriptedMove(game, turn);
  const moves = planMoves(info, turn);
  if (!played || !moves.includes(uciOf(played.move))) return null;
  return { ...texts(info), planMoves: moves, offPlan: info.offPlan, line: [uciOf(played.move)] };
}

/** The move in words: "castle", "push your d-pawn to d4", "put your bishop on b3". */
export function moveWords(move: Move): string {
  if (move.isKingsideCastle()) return 'castle';
  if (move.isQueensideCastle()) return 'castle on the queenside';
  const piece = move.piece === 'p' ? `${move.from[0]}-pawn` : NAME[move.piece];
  if (move.captured) return `take on ${move.to} with your ${piece}`;
  return move.piece === 'p' ? `push your ${piece} to ${move.to}` : `put your ${piece} on ${move.to}`;
}

/** The pieces of the other side that the moved piece attacks once it lands, the biggest first. */
function targetsOf(move: Move): Square[] {
  const after = new Chess(move.after);
  const attacked = (square: Square) => after.attackers(square, move.color).includes(move.to);
  const hit = after.board().flatMap((row) => row.flatMap((p) => (p && p.color !== move.color && attacked(p.square) ? [p] : [])));
  return hit
    .sort((a, b) => VALUE[b.type] - VALUE[a.type])
    .slice(0, MAX_TARGETS)
    .map((p) => p.square);
}

/** Look at the plan, play its move, see why it works there, then the idea. The why step only where the textbook holds. */
function planBeats(lesson: PlanLesson, move: Move, board: Chess): Beat[] {
  const step = lesson.plan.fits(move, board)!;
  const uci = uciOf(move);
  const targets = targetsOf(move);
  const look: Beat = { fen: move.before, text: lesson.hint, marks: [{ square: move.from, tone: 'focus' }], arrows: [] };
  const ask: Beat = {
    fen: move.before,
    text: `Here the plan is to ${moveWords(move)}.`,
    marks: [],
    arrows: [{ from: move.from, to: move.to, tone: 'best' }],
    ask: 'Your move: play it.',
    answer: uci,
  };
  const why: Beat = {
    fen: move.after,
    move: uci,
    text: lesson.why(step),
    marks: [],
    arrows: targets.map((to) => ({ from: move.to, to, tone: 'best' as const })),
    claims: targets.length ? [{ claim: 'attacks', square: move.to, squares: targets }] : [],
  };
  const end: Beat = { fen: move.after, text: lesson.idea, marks: [], arrows: [], line: [] };
  return lesson.plan.textbook(move, board) ? [look, ask, why, end] : [look, ask, end];
}

/** The worked example of an opening lesson on this turn; null when the turn doesn't fit its plan. */
export function openingBeats(lesson: OpeningLessonId, game: Game, turnIndex: number): Beat[] | null {
  const info = OPENING_LESSONS[lesson];
  if (info.kind === 'traps') return trapBeats(game);
  const turn = game.turns[turnIndex];
  const played = turn && scriptedMove(game, turn);
  if (!played || info.plan.fits(played.move, played.board) === null) return null;
  return planBeats(info, played.move, played.board);
}
