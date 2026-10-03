import { describe, expect, it } from 'vitest';
import type { Depth } from '../content/types';
import { lessonFor } from '../learn';
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
  it('climbs Pattern, Piece, Move on the play step, and the button names the next rung', () => {
    expect(hintLadder(after(3, toSolve))).toEqual({ stops: ['Pattern', 'Piece', 'Move'], used: 0 });
    expect(hintButtonLabel(hintLadder(after(3, toSolve)))).toBe('Hint · 1 of 3');
    expect(hintButtonLabel(hintLadder(after(3, [...toSolve, hint])))).toBe('Hint · 2 of 3');
    expect(hintButtonLabel(hintLadder(after(3, [...toSolve, hint, hint])))).toBe('Hint · 3 of 3');
  });

  it('stays on the last rung once every hint is used', () => {
    const used = hintLadder(after(3, [...toSolve, hint, hint, hint]));
    expect(used.used).toBe(3);
    expect(hintButtonLabel(used)).toBe('Hint · 3 of 3');
  });

  it('starts at the piece on a follow-up move, which has no pattern of its own', () => {
    expect(hintLadder(after(5, toFollowUp))).toEqual({ stops: ['Piece', 'Move'], used: 0 });
    expect(hintButtonLabel(hintLadder(after(5, [...toFollowUp, hint])))).toBe('Hint · 2 of 2');
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

  it('points at the trapped piece', () => {
    const trapped = italian1.turns.findIndex((_, i) => lessonFor(italian1, i).theme.id === 'trapped-piece');
    expect(pieceInTrouble(italian1, trapped)).toEqual({ squares: ['e6'], text: "It's Black's knight on e6." });
  });

  it('is left out where the lesson names no piece on the board', () => {
    const quiet = italian1.turns.findIndex((t) => t.label === 'nothing');
    expect(pieceInTrouble(italian1, quiet)).toBeNull();
  });
});
