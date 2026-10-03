import { describe, expect, it } from 'vitest';
import { playLine } from './board';
import { tradeOf, type Trade } from './trade';
import { tradeText } from './words';

const trade = (fen: string, ucis: string[]) => tradeOf(playLine(fen, ucis), 'w');
const text = (partial: Partial<Trade>) => tradeText({ won: [], lost: [], net: 0, promoted: [], gains: [], ...partial });

describe('tradeOf', () => {
  it('counts a knight taken for a pawn as exactly that', () => {
    const result = trade('4k3/8/4p3/3n4/4P3/8/8/4K3 w - - 0 1', ['e4d5', 'e6d5']);
    expect(result).toMatchObject({ won: ['n'], lost: ['p'], net: 2 });
  });

  it('cancels a like-for-like recapture on the same square', () => {
    // Bxd5 Nxd5 Qxd5: the bishop and knight swap, and the pawn is what is won.
    const result = trade('4k3/8/5n2/3p4/8/8/3Q2B1/4K3 w - - 0 1', ['g2d5', 'f6d5', 'd2d5']);
    expect(result).toMatchObject({ won: ['p'], lost: [], gains: [0] });
    const swap = trade('4k3/6b1/5n2/8/8/8/1B6/4K3 w - - 0 1', ['b2f6', 'g7f6']);
    expect(swap).toMatchObject({ won: [], lost: [], net: 0 });
  });

  it('keeps the first capture when the recaptures are an even swap', () => {
    // Bxf2 takes a knight; Bxf2+ Qxf2 swaps bishops.
    const result = trade('4k3/8/8/2b5/7B/8/5n2/3QK3 w - - 0 1', ['h4f2', 'c5f2', 'e1f2']);
    expect(result).toMatchObject({ won: ['n'], lost: [], gains: [0] });
  });

  it('counts a promoted piece that is taken back as a pawn', () => {
    const result = trade('1r2k3/P7/8/8/8/8/8/4K3 w - - 0 1', ['a7a8q', 'b8a8']);
    expect(result).toMatchObject({ won: [], lost: ['p'], net: -1, promoted: [] });
  });

  it('keeps a promotion that survives', () => {
    const result = trade('4k3/P7/8/8/8/8/8/4K3 w - - 0 1', ['a7a8q']);
    expect(result).toMatchObject({ net: 8, promoted: ['q'] });
  });
});

describe('tradeText', () => {
  it('names both sides of the trade', () => {
    expect(text({ won: ['q'], lost: ['n', 'p'] })).toBe('the queen for a knight and a pawn');
    expect(text({ won: ['n'], lost: ['p'] })).toBe('a knight for a pawn');
    expect(text({ won: ['r'], lost: ['b'] })).toBe('a rook for a bishop');
  });

  it('counts pieces of one kind', () => {
    expect(text({ won: ['p', 'p'] })).toBe('two pawns');
    expect(text({ won: ['r', 'n', 'p'] })).toBe('a rook, a knight and a pawn');
  });

  it('says whose queen is given up and names a new queen', () => {
    expect(text({ won: ['r'], lost: ['q'], promoted: ['q'] })).toBe('a rook and a new queen for your queen');
  });
});
