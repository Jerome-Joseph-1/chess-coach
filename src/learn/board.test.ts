import { Chess } from 'chess.js';
import { describe, expect, it } from 'vitest';
import { exchangeGain, isBetween, isLoose, pinOn } from './board';

describe('exchangeGain', () => {
  it('wins an undefended piece outright', () => {
    expect(exchangeGain(new Chess('4k3/8/8/3n4/8/8/8/3QK3 w - - 0 1'), 'd5')).toBe(3);
  });

  it('stops before a losing recapture', () => {
    // Rxd5 exd5 would give a rook for a pawn, so the rook doesn't start.
    expect(exchangeGain(new Chess('4k3/8/4p3/3p4/8/8/8/3RK3 w - - 0 1'), 'd5')).toBe(0);
  });

  it('wins material with a cheaper attacker even when defended', () => {
    expect(exchangeGain(new Chess('4k3/8/4p3/3n4/4P3/8/8/4K3 w - - 0 1'), 'd5')).toBe(2);
  });

  it('only counts legal captures', () => {
    // The knight on d4 is pinned to its king and can't take on e6.
    expect(exchangeGain(new Chess('3k4/8/4r3/8/3N4/8/1B6/K7 b - - 0 1'), 'e6')).toBe(0);
    expect(exchangeGain(new Chess('3k4/8/4r3/8/3N4/8/8/K6b w - - 0 1'), 'e6')).toBe(5);
  });
});

describe('isLoose', () => {
  it('works whichever side is to move, even in check', () => {
    expect(isLoose('4k3/8/8/3n4/8/8/8/3QK3 w - - 0 1', 'd5')).toBe(true);
    expect(isLoose('4k3/8/8/3n4/8/8/8/3QK3 b - - 0 1', 'd5')).toBe(true);
    expect(isLoose('4k3/4R3/8/3n4/8/8/8/3QK3 b - - 0 1', 'd5')).toBe(true);
    expect(isLoose('4k3/8/4p3/3n4/8/8/8/3QK3 w - - 0 1', 'd5')).toBe(false);
  });
});

describe('pinOn', () => {
  it('finds a knight pinned to the king', () => {
    const pin = pinOn(new Chess('4k3/8/2n5/1B6/8/8/8/4K3 b - - 0 1'), 'c6');
    expect(pin).toMatchObject({ pinner: { square: 'b5', type: 'b' }, behind: { square: 'e8', type: 'k' } });
  });

  it('ignores a piece with something smaller behind it', () => {
    expect(pinOn(new Chess('3nk3/8/5r2/6B1/8/8/8/4K3 b - - 0 1'), 'f6')).toBeNull();
  });

  it('ignores a pin by a queen against a guarded queen', () => {
    expect(pinOn(new Chess('3qk3/3r4/3n4/8/8/8/8/3QK3 b - - 0 1'), 'd6')).toBeNull();
  });
});

describe('isBetween', () => {
  it('works on lines and diagonals only', () => {
    expect(isBetween('a1', 'c3', 'h8')).toBe(true);
    expect(isBetween('a1', 'a4', 'a8')).toBe(true);
    expect(isBetween('a1', 'b3', 'c5')).toBe(false);
    expect(isBetween('a1', 'h8', 'c3')).toBe(false);
  });
});
