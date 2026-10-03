import { describe, expect, it } from 'vitest';
import { tacticIn } from './tactics';

describe('tacticIn on built positions', () => {
  it('finds a knight fork of king and rook', () => {
    const tactic = tacticIn('r3k3/8/8/3N4/8/8/8/4K3 w - - 0 1', ['d5c7', 'e8d7', 'c7a8'], 'w');
    expect(tactic).toMatchObject({ id: 'fork', forker: { square: 'c7', type: 'n' }, won: { square: 'a8', type: 'r' } });
  });

  it('finds a back-rank mate', () => {
    const tactic = tacticIn('6k1/5ppp/8/8/8/8/8/R5K1 w - - 0 1', ['a1a8'], 'w');
    expect(tactic).toMatchObject({ id: 'checkmate', backRank: true, boxedByPawns: true, key: 0 });
  });

  it('finds a skewer through the king', () => {
    const tactic = tacticIn('8/8/8/4k2r/8/8/8/R3K3 w - - 0 1', ['a1a5', 'e5d6', 'a5h5'], 'w');
    expect(tactic).toMatchObject({ id: 'skewer', front: { type: 'k' }, back: { square: 'h5', type: 'r' } });
  });

  it('finds a free piece', () => {
    const tactic = tacticIn('4k3/8/8/3n4/8/8/8/3QK3 w - - 0 1', ['d1d5'], 'w');
    expect(tactic).toMatchObject({ id: 'free-piece', reason: 'undefended' });
  });

  it('finds a piece won by removing its only guard', () => {
    // Bxf6 gxf6 leaves the pawn on d5 to the knight.
    const tactic = tacticIn('4k3/6p1/5n2/3p2B1/8/2N5/8/4K3 w - - 0 1', ['g5f6', 'g7f6', 'c3d5'], 'w');
    expect(tactic).toMatchObject({ id: 'remove-defender', defender: { square: 'f6', type: 'n' }, how: 'capture' });
  });

  it('wins nothing from an even trade', () => {
    expect(tacticIn('4k3/6b1/5n2/8/8/8/1B6/4K3 w - - 0 1', ['b2f6', 'g7f6'], 'w')).toBeNull();
  });
});
