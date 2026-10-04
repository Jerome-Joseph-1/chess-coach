import { Chess } from 'chess.js';
import { describe, expect, it } from 'vitest';
import type { Game } from '../../content/types';
import { checkBeats, type Walk } from '../../learn/beatChecks';
import { italian2 } from '../../pause/testGames';
import type { OpeningLessonId } from '../types';
import turns from './fixtures/plan-turns.json';
import { planLessonAt } from './mine';
import { PLAN_LESSONS, type PlanLessonId } from './plans';
import { openingBeats, openingLessonAt, teachingFor } from './teach';
import { trapBeats } from './trapBeats';
import { readTraps } from './trapGames';

const trapGames = readTraps().map((trap) => ({ ...trap, level: 1400 }) as Game);
const trapGame = (role: 'example' | 'drill') => trapGames.find((g) => (g as unknown as { role: string }).role === role)!;
const realGames = Object.values(turns).map(({ game }) => game as unknown as Game);

/** A one-turn game on the position these moves reach, asking `san`; enough for the worked example, which needs no grades. */
function lineGame(sans: string, san: string): Game {
  const chess = new Chess();
  const moves = sans.split(' ');
  moves.forEach((m) => chess.move(m));
  const side = chess.turn();
  const turn = { ply: moves.length, moveNo: chess.moveNumber(), fen: chess.fen(), label: 'gray', inCheck: false, grades: {}, lines: {} };
  return { id: sans, opening: side === 'w' ? 'italian' : 'caro-kann', level: 1400, side, start: [], moves: [...moves, san], turns: [turn] } as unknown as Game;
}

const EXCHANGE = 'e4 c6 d4 d5 exd5 cxd5 Bd3 Nc6 c3 Nf6';
const CASTLED = `${EXCHANGE} Bf4 e6 Nf3 Bd6 Bxd6 Qxd6 O-O O-O`;

/** A textbook position for every step a plan lesson's worked example can show. */
const STEPS: [PlanLessonId, string, string][] = [
  ['italian-idea', 'e4 e5 Nf3 Nc6 Bc4 Bc5 d3 Nf6', 'O-O'],
  ['italian-centre', 'e4 e5 Nf3 Nc6 Bc4 Bc5 c3 Nf6', 'd4'],
  ['italian-slow', 'e4 e5 Nf3 Nc6 Bc4 Nf6', 'd3'],
  ['italian-slow', 'e4 e5 Nf3 Nc6 Bc4 Bc5 c3 Nf6 d3 O-O O-O d6', 'Re1'],
  ['italian-ng5', 'e4 e5 Nf3 Nc6 Bc4 Nf6', 'Ng5'],
  ['caro-kann-idea', 'e4 c6 d4', 'd5'],
  ['caro-kann-idea', 'e4 c6 d4 d5 exd5', 'cxd5'],
  ['caro-kann-bishop', 'e4 c6 d4 d5 e5', 'Bf5'],
  ['caro-kann-bishop', 'e4 c6 Nf3 d5 e5', 'Bg4'],
  ['caro-kann-c5', 'e4 c6 d4 d5 e5 Bf5 Nf3 e6 Be2', 'c5'],
  ['caro-kann-exchange', 'e4 c6 d4 d5 exd5 cxd5 Bd3', 'Nc6'],
  ['caro-kann-exchange', `${EXCHANGE} Nf3`, 'Bg4'],
  ['caro-kann-exchange', `${EXCHANGE} Nf3`, 'Bf5'],
  ['caro-kann-exchange', `${EXCHANGE} Bf4`, 'Qb6'],
  ['caro-kann-exchange', `${EXCHANGE} Bf4`, 'Qc7'],
  ['caro-kann-exchange', `${CASTLED} Re1`, 'b5'],
  ['caro-kann-exchange', `${CASTLED} Re1 b5 Bc2`, 'b4'],
];

function walks(): Walk[] {
  const steps = STEPS.map(([lesson, sans, san]) => ({ id: `${lesson} ${san}`, beats: openingBeats(lesson, lineGame(sans, san), 0)! }));
  const real = [italian2, ...realGames].flatMap((game) =>
    game.turns.flatMap((_, i) => {
      const lesson = planLessonAt(game, i);
      return lesson ? [{ id: `${game.id}#${i}`, beats: openingBeats(lesson.id, game, i)! }] : [];
    }),
  );
  const traps = trapGames.flatMap((game) => {
    const beats = openingBeats(openingLessonAt(game, 0)!, game, 0);
    return beats ? [{ id: game.id, beats }] : [];
  });
  return [...steps, ...real, ...traps];
}

describe('openingBeats on every plan step and real plan turn', () => {
  it('shows every step with its why line, from the textbook positions', () => {
    for (const [lesson, sans, san] of STEPS) expect(openingBeats(lesson, lineGame(sans, san), 0), `${lesson} ${san}`).toHaveLength(4);
  });

  checkBeats(walks(), 10);
});

describe('openingBeats', () => {
  it('looks at the plan, asks for its move, shows why it works here, then gives the idea', () => {
    const lesson = PLAN_LESSONS['italian-slow'];
    const beats = openingBeats('italian-slow', italian2, 6)!;
    expect(beats.map((b) => b.text)).toEqual([lesson.hint, 'Here the plan is to put your bishop on b3.', lesson.why('Bb3'), lesson.idea]);
    expect(beats[0].marks).toEqual([{ square: 'c4', tone: 'focus' }]);
    expect(beats[1]).toMatchObject({ ask: 'Your move: play it.', answer: 'c4b3', arrows: [{ from: 'c4', to: 'b3', tone: 'best' }] });
    expect(beats[2]).toMatchObject({ move: 'c4b3', arrows: [{ from: 'b3', to: 'f7', tone: 'best' }] });
    expect(beats[3]).toMatchObject({ fen: beats[2].fen, line: [] });
  });

  it("points at no more than two of the opponent's pieces, the biggest first", () => {
    const beats = openingBeats('italian-centre', lineGame('e4 e5 Nf3 Nc6 Bc4 Bc5 c3 Nf6', 'd4'), 0)!;
    expect(beats[2].arrows.map((a) => a.to)).toEqual(['c5', 'e5']);
  });

  it('leaves out the why step where the textbook does not hold, and gives nothing where the plan does not fit', () => {
    // d3 here guards e4, but no knight on f6 attacks it.
    expect(openingBeats('italian-slow', italian2, 5)!.map((b) => b.text)).toEqual([
      PLAN_LESSONS['italian-slow'].hint,
      'Here the plan is to push your d-pawn to d3.',
      PLAN_LESSONS['italian-slow'].idea,
    ]);
    expect(openingBeats('italian-centre', italian2, 5)).toBeNull();
  });

  it("hands a trap lesson's example to its own steps", () => {
    const example = trapGame('example');
    expect(openingBeats(openingLessonAt(example, 0)!, example, 0)).toEqual(trapBeats(example));
  });
});

describe('teachingFor', () => {
  it("asks for the plan in the lesson's words, takes its good moves as found and tries another good move again", () => {
    const { name, icon, hint, idea, remember, ask, offPlan } = PLAN_LESSONS['italian-slow'];
    expect(teachingFor('italian-slow', italian2, 5)).toEqual({ name, icon, hint, idea, remember, ask, offPlan, planMoves: ['d2d3'], line: ['d2d3'] });
  });

  it("gives nothing where the game's move does not carry out the plan", () => {
    expect(teachingFor('italian-slow', italian2, 4)).toBeNull();
    expect(teachingFor('italian-centre', italian2, 5)).toBeNull();
  });

  it("gives a trap its own name, question and reason, and takes every move that holds", () => {
    const drill = trapGame('drill');
    const { title, ask, why } = drill as unknown as { title: string; ask: string; why: string };
    const [turn] = drill.turns;
    const holding = Object.keys(turn.grades).filter((uci) => turn.grades[uci] <= 2.5);
    const teaching = teachingFor(openingLessonAt(drill, 0)!, drill, 0)!;
    expect(teaching).toMatchObject({ name: title, ask, idea: why, planMoves: holding, line: turn.lines.best });
    expect(teaching.offPlan).toBeUndefined();
  });
});

describe('openingLessonAt', () => {
  it('finds the plan lesson of a quiet turn from its move, and none for a critical turn', () => {
    expect([1, 4, 5, 6].map((i) => openingLessonAt(italian2, i))).toEqual([null, 'italian-idea', 'italian-slow', 'italian-slow']);
  });

  it("files a trap game under its lesson, or its opening's trap lesson", () => {
    const drill = trapGame('drill');
    expect(openingLessonAt(drill, 0)).toBe((drill as unknown as { lesson: OpeningLessonId }).lesson);
    const bare = { ...lineGame('e4 c6 d4 d5 Nc3', 'dxe4'), id: 'trap-caro-kann-new' };
    expect(openingLessonAt(bare, 0)).toBe('caro-kann-traps');
  });
});
