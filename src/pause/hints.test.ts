import { Chess, type Square } from 'chess.js';
import { describe, expect, it } from 'vitest';
import type { Depth } from '../content/types';
import { lessonFor } from '../learn';
import { learnGame, learnGames } from '../learn/fixtures';
import { flowReducer, initialState, scriptedUci, type FlowContext, type FlowEvent, type FlowState } from './flow';
import { hintButtonLabel, hintLadder, hintSquares, pieceInTrouble } from './hints';
import { italian1, italian2 } from './testGames';
import { slowPlan } from './testTeaching';

const TURN = 3;

function after(depth: Depth, events: FlowEvent[]): FlowState {
  const ctx: FlowContext = { game: italian1, turnIndex: TURN, depth, type: 'pause' };
  return events.reduce((state, event) => flowReducer(ctx, state, event), initialState(ctx));
}

const hint: FlowEvent = { type: 'hint' };
const toSolve: FlowEvent[] = [{ type: 'spot', pick: 'win' }, { type: 'advance' }];
const toFollowUp: FlowEvent[] = [...toSolve, { type: 'move', uci: scriptedUci(italian1, TURN) }, { type: 'advance' }, { type: 'replied' }];

describe('the hint ladder', () => {
  it('climbs Idea, Piece, Move on the play step, and the button says what the next tap shows', () => {
    expect(hintLadder(after(3, toSolve))).toEqual({ stops: ['Idea', 'Piece', 'Move'], used: 0 });
    expect(hintButtonLabel(hintLadder(after(3, toSolve)))).toBe('Hint: the idea');
    expect(hintButtonLabel(hintLadder(after(3, [...toSolve, hint])))).toBe('Hint: the piece');
    expect(hintButtonLabel(hintLadder(after(3, [...toSolve, hint, hint])))).toBe('Hint: the move');
  });

  it('says so once every hint is used', () => {
    const used = hintLadder(after(3, [...toSolve, hint, hint, hint]));
    expect(used.used).toBe(3);
    expect(hintButtonLabel(used)).toBe('No hints left');
  });

  it('starts at the piece on a follow-up move, which has no pattern of its own', () => {
    expect(hintLadder(after(5, toFollowUp))).toEqual({ stops: ['Piece', 'Move'], used: 0 });
    expect(hintButtonLabel(hintLadder(after(5, toFollowUp)))).toBe('Hint: the piece');
    expect(hintButtonLabel(hintLadder(after(5, [...toFollowUp, hint])))).toBe('Hint: the move');
  });
});

describe('the squares the second hint marks', () => {
  const drill: FlowContext = { game: italian2, turnIndex: 5, depth: 1, type: 'pause', mode: 'drill' };
  const second = flowReducer(drill, initialState(drill), hint);

  it('mark the piece in trouble on the play step', () => {
    expect(second.hint).toBe(2);
    expect(hintSquares(italian2, second)).toEqual(['c1']);
  });

  it("mark the piece of the plan move in an opening lesson, which names no piece in trouble", () => {
    expect(hintSquares(italian2, second, slowPlan)).toEqual(['d2']);
  });

  it('mark the piece to move on a follow-up move', () => {
    const state = after(5, [...toFollowUp, hint]);
    expect(hintSquares(italian1, state)).toEqual([scriptedUci(italian1, state.turn).slice(0, 2)]);
  });
});

describe('the piece in trouble', () => {
  it('points at the defender to take away, not at the piece to move, and says what it guards', () => {
    const trouble = pieceInTrouble(italian1, TURN)!;
    expect(trouble).toEqual({ squares: ['c6'], text: "Look at Black's knight on c6: it guards the pawn on e5." });
    expect(trouble.squares).not.toContain(scriptedUci(italian1, TURN).slice(0, 2));
  });

  it('points at the loose piece to win, and says how it is guarded', () => {
    const free = italian1.turns.findIndex((_, i) => lessonFor(italian1, i).theme.id === 'free-piece');
    expect(pieceInTrouble(italian1, free)).toEqual({ squares: ['e5'], text: "Look at Black's pawn on e5: it isn't defended enough." });
    const lastFree = italian1.turns.findLastIndex((_, i) => lessonFor(italian1, i).theme.id === 'free-piece');
    expect(pieceInTrouble(italian1, lastFree)?.text).toBe("Look at Black's bishop on e6: nothing guards it.");
  });

  it('points at the piece to pin, and does not call it pinned before it is', () => {
    const pinned = italian1.turns.findIndex((_, i) => lessonFor(italian1, i).theme.id === 'pin');
    expect(pieceInTrouble(italian1, pinned)).toEqual({ squares: ['e6'], text: "Look at Black's knight on e6: it can be pinned." });
  });

  it('points at the trapped piece', () => {
    const game = learnGame('italian-1400-0003');
    expect(lessonFor(game, 3).theme.id).toBe('trapped-piece');
    expect(pieceInTrouble(game, 3)).toEqual({ squares: ['a5'], text: "Look at Black's knight on a5: it can be trapped." });
  });

  it('says which of your pieces is in danger, and why when it can', () => {
    const game = learnGame('italian-1400-0003');
    expect(lessonFor(game, 6).theme.id).toBe('hanging-own');
    expect(pieceInTrouble(game, 6)?.text).toBe("Your knight on f3 is in danger: it isn't defended enough.");
    const caroKann = learnGame('caro-kann-1100-0025');
    expect(pieceInTrouble(caroKann, 25)?.text).toBe('Your rook on e2 is in danger: nothing guards it.');
    expect(pieceInTrouble(caroKann, 28)?.text).toBe('Your rooks on c8 and e2 are in danger.');
    expect(pieceInTrouble(caroKann, 15)?.text).toBe('Your king on g8 is in danger.');
  });

  it('warns about the piece a trap would cost, without naming the tempting move', () => {
    const game = learnGame('caro-kann-1100-0025');
    expect(lessonFor(game, 6).theme.id).toBe('bait');
    expect(pieceInTrouble(game, 6)?.text).toBe('Careful with your queen on d8 and rook on h8: a tempting move puts them in danger.');
  });

  it('names two targets together and what they have in common', () => {
    const game = learnGame('caro-kann-1100-0001');
    expect(pieceInTrouble(game, 5)?.text).toBe("Look at White's queen on f3 and rook on d1: they stand on one line.");
    expect(pieceInTrouble(game, 12)?.text).toBe("Look at White's queen on f3 and king on b1: one move can attack both.");
  });

  it('points at the king that can be mated', () => {
    const game = learnGame('italian-1400-0001');
    expect(lessonFor(game, 13).theme.id).toBe('mate-threat');
    expect(pieceInTrouble(game, 13)?.text).toBe("Look at Black's king on h8: you can threaten mate.");
  });

  it('never names a square the move goes to', () => {
    for (const game of [italian1, ...learnGames]) {
      game.turns.forEach((turn, i) => {
        if (turn.label !== 'critical') return;
        const to = scriptedUci(game, i).slice(2, 4);
        const text = pieceInTrouble(game, i)?.text ?? '';
        const captures = new Chess(turn.fen).get(to as Square);
        if (!captures) expect(text, `${game.id} turn ${i}`).not.toContain(to);
      });
    }
  });

  it('is left out where the lesson names no piece on the board', () => {
    const quiet = italian1.turns.findIndex((t) => t.label === 'nothing');
    expect(pieceInTrouble(italian1, quiet)).toBeNull();
  });
});
