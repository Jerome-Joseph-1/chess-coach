import { describe, expect, it } from 'vitest';
import type { Depth } from '../content/types';
import { lessonFor } from '../learn';
import { learnGame } from '../learn/fixtures';
import { flowReducer, initialState, scriptedUci, type FlowContext, type FlowEvent, type FlowState } from './flow';
import { hintButtonLabel, hintLadder, pieceInTrouble } from './hints';
import { italian1 } from './testGames';

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

describe('the piece in trouble', () => {
  it('points at the defender to take away, not at the piece to move', () => {
    const trouble = pieceInTrouble(italian1, TURN)!;
    expect(trouble).toEqual({ squares: ['c6'], text: "It's Black's knight on c6." });
    expect(trouble.squares).not.toContain(scriptedUci(italian1, TURN).slice(0, 2));
  });

  it('points at the loose piece to win', () => {
    const free = italian1.turns.findIndex((_, i) => lessonFor(italian1, i).theme.id === 'free-piece');
    expect(pieceInTrouble(italian1, free)).toEqual({ squares: ['e5'], text: "It's Black's pawn on e5." });
  });

  it('points at the pinned piece', () => {
    const pinned = italian1.turns.findIndex((_, i) => lessonFor(italian1, i).theme.id === 'pin');
    expect(pieceInTrouble(italian1, pinned)).toEqual({ squares: ['e6'], text: "It's Black's knight on e6." });
  });

  it('points at the trapped piece', () => {
    const game = learnGame('italian-1400-0003');
    expect(lessonFor(game, 3).theme.id).toBe('trapped-piece');
    expect(pieceInTrouble(game, 3)).toEqual({ squares: ['a5'], text: "It's Black's knight on a5." });
  });

  it('is left out where the lesson names no piece on the board', () => {
    const quiet = italian1.turns.findIndex((t) => t.label === 'nothing');
    expect(pieceInTrouble(italian1, quiet)).toBeNull();
  });
});
