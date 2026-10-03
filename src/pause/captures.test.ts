import { describe, expect, it } from 'vitest';
import { capturesIn, materialLoss, valueOf } from './captures';
import { playLine } from './position';
import { italian1, italian2 } from './testGames';

const line = (fen: string, moves: string[]) => playLine(fen, moves);

describe('capturesIn', () => {
  it('lists what each side takes', () => {
    const fen = 'r2qkb1r/ppp2ppp/3p1n2/n2Pp3/4P1b1/3B1N2/PPP2PPP/RNBQK2R w KQkq - 3 7';
    expect(capturesIn(line(fen, ['b2b4', 'c7c6', 'b4a5', 'c6d5']), 'w')).toEqual({ won: ['n'], lost: ['p'] });
    expect(capturesIn(line(fen, ['b2b4', 'c7c6', 'b4a5', 'c6d5']), 'b')).toEqual({ won: ['p'], lost: ['n'] });
  });

  it('takes a piece for the same piece, or one of equal worth, out of both sides', () => {
    const turn = italian1.turns[1];
    // dxe5 d5 Bxd5 Bf5 Bxc6+ bxc6: the user takes two pawns and a knight, loses a bishop.
    const taken = capturesIn(line(turn.fen, turn.lines.best!), 'w');
    expect(taken).toEqual({ won: ['p', 'p'], lost: [] });
  });

  it('has nothing for a line without captures', () => {
    expect(capturesIn(line(italian1.turns[0].fen, ['e2e4', 'e7e5']), 'w')).toEqual({ won: [], lost: [] });
  });
});

describe('valueOf', () => {
  it('adds up the usual values', () => {
    expect(valueOf(['q', 'n', 'p'])).toBe(13);
    expect(valueOf([])).toBe(0);
  });
});

describe('materialLoss', () => {
  it('is null when the line leaves the user level or ahead', () => {
    const turn = italian1.turns[3];
    expect(materialLoss(turn.fen, line(turn.fen, turn.lines.best!), 'w')).toBeNull();
    expect(materialLoss(turn.fen, line(turn.fen, ['b1d2', ...turn.refutations.b1d2]), 'w')).toBeNull();
    expect(materialLoss(turn.fen, [], 'w')).toBeNull();
  });

  it('names the biggest piece lost and the move that took it', () => {
    const turn = italian1.turns[3];
    expect(materialLoss(turn.fen, line(turn.fen, ['d1d5', ...turn.refutations.d1d5]), 'w')).toEqual({ piece: 'q', san: 'Bxd5', at: 5 });
  });

  it('counts a pawn taken for a knight lost as the knight', () => {
    const turn = italian2.turns[1];
    expect(materialLoss(turn.fen, line(turn.fen, turn.lines.mistake!), 'w')).toMatchObject({ piece: 'n', san: 'Nxe5' });
  });
});
