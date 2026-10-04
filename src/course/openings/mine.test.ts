import { Chess } from 'chess.js';
import { describe, expect, it } from 'vitest';
import type { Game } from '../../content/types';
import { italian2 } from '../../pause/testGames';
import turns from './fixtures/plan-turns.json';
import { PLAN_CLEAN, planCandidatesOf, planLessonAt, planMoves } from './mine';
import { PLAN_LESSONS } from './plans';

type Key = keyof typeof turns;

/** A one-turn game holding a real plan turn, keyed "game-id#turn-index", and its set. */
function planTurn(key: Key): { set: string; game: Game } {
  const { set, game } = turns[key];
  return { set, game: game as unknown as Game };
}

function mined(key: Key) {
  const { set, game } = planTurn(key);
  return planCandidatesOf(set, game);
}

describe('planCandidatesOf', () => {
  it('takes a textbook plan move that beats every other move by far as a clean example', () => {
    expect(mined('italian-2000-0219#5')).toEqual([
      {
        ref: { set: 'italian-2000', gameId: 'italian-2000-0219', ply: 11, findShare: expect.any(Number) },
        unit: 'italian-slow',
        position: expect.stringMatching(/^r1bq1rk1\/2p1bppp/),
        clarity: PLAN_CLEAN,
        sound: true,
        tier: 0,
        contested: false,
        picture: 'italian-slow Bb3 two-knights-d3',
        textbook: true,
      },
    ]);
  });

  it('keeps a plan move about as good as others when players at the level play it most', () => {
    // d3 loses 0.2 less than castling, and 49% play it.
    expect(mined('italian-1400-0044#1')).toMatchObject([{ unit: 'italian-slow', sound: true, contested: true, textbook: true, clarity: 1 }]);
    expect(mined('caro-kann-1400-0016#1')).toMatchObject([{ unit: 'caro-kann-idea', sound: true, contested: true, textbook: false, clarity: 0 }]);
  });

  it('marks a plan move that neither stands out nor is the usual move as unsound', () => {
    // Castling here is 0.6 worse than the best move, and most players do something else.
    expect(mined('italian-1400-0001#2')).toMatchObject([{ unit: 'italian-idea', sound: false }]);
  });

  it('leaves out critical turns, turns in check, moves past the plan and moves that lose', () => {
    expect(planTurn('italian-1400-0033#0').game.turns[0].label).toBe('critical');
    expect(planTurn('caro-kann-1400-0015#3').game.turns[0].inCheck).toBe(true);
    expect(planTurn('italian-1400-0005#14').game.turns[0].moveNo).toBeGreaterThan(PLAN_LESSONS['italian-idea'].plan.byMove);
    expect(planTurn('italian-1400-0029#1').game.turns[0].grades.d2d3).toBeGreaterThan(2.5);
    for (const key of ['italian-1400-0033#0', 'caro-kann-1400-0015#3', 'italian-1400-0005#14', 'italian-1400-0029#1'] as const) {
      expect(mined(key), key).toEqual([]);
    }
  });

  it('gives a position to the first lesson its move fits, once', () => {
    const { game } = planTurn('caro-kann-1400-0004#4');
    const turn = game.turns[0];
    const move = new Chess(turn.fen).move(game.moves[turn.ply]);
    expect(PLAN_LESSONS['caro-kann-exchange'].plan.fits(move, new Chess(turn.fen))).toBe('Bg4');
    expect(mined('caro-kann-1400-0004#4').map((c) => c.unit)).toEqual(['caro-kann-bishop']);
  });

  it('finds the slow plan in the test game: Bb3 to show, d3 to practise, the castling before it unsound', () => {
    expect(planCandidatesOf('italian-1400', italian2).map((c) => [c.ref.ply, c.unit, c.sound, c.textbook])).toEqual([
      [9, 'italian-idea', false, false],
      [11, 'italian-slow', true, false],
      [13, 'italian-slow', true, true],
    ]);
  });
});

describe('planLessonAt', () => {
  it('names the plan lesson of a quiet turn, and none for a critical one', () => {
    expect([1, 4, 5, 6].map((i) => planLessonAt(italian2, i)?.id ?? null)).toEqual([null, 'italian-idea', 'italian-slow', 'italian-slow']);
  });
});

describe('planMoves', () => {
  it('lists the good moves that carry out the plan, the scripted one among them', () => {
    expect(planMoves(PLAN_LESSONS['italian-slow'], italian2.turns[5])).toEqual(['d2d3']);
    expect(planMoves(PLAN_LESSONS['caro-kann-bishop'], planTurn('caro-kann-1400-0004#4').game.turns[0]).sort()).toEqual(['c8f5', 'c8g4']);
  });

  it('leaves out a plan move that loses too much', () => {
    const [turn] = planTurn('italian-1400-0029#1').game.turns;
    expect(turn.grades.d2d3).toBeGreaterThan(2.5);
    expect(planMoves(PLAN_LESSONS['italian-slow'], turn)).toEqual([]);
  });
});
