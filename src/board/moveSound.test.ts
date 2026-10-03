import { describe, expect, it } from 'vitest';
import { soundBetween, soundForUci } from './moveSound';

const START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

describe('soundForUci', () => {
  it('knocks plainly for a quiet move', () => {
    expect(soundForUci(START, 'e2e4')).toBe('piece');
  });

  it('uses the heavier knock for a capture, en passant included', () => {
    expect(soundForUci('rnbqkbnr/ppp1pppp/8/3p4/4P3/8/PPPP1PPP/RNBQKBNR w KQkq d6 0 2', 'e4d5')).toBe('capture');
    expect(soundForUci('rnbqkbnr/ppp1pppp/8/8/3pP3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 3', 'd4e3')).toBe('capture');
  });

  it('pings a check, and checkmate too', () => {
    expect(soundForUci('rnbqkbnr/ppppp2p/5p2/6p1/4P3/3P4/PPP2PPP/RNBQKBNR w KQkq - 0 3', 'd1h5')).toBe('check');
    expect(soundForUci('rnbqkbnr/pppp1ppp/8/4p3/6P1/5P2/PPPPP2P/RNBQKBNR b KQkq - 0 2', 'd8h4')).toBe('check');
  });

  it('plays the castle knock on both sides', () => {
    expect(soundForUci('r3k2r/pppppppp/8/8/8/8/PPPPPPPP/R3K2R w KQkq - 0 1', 'e1g1')).toBe('castle');
    expect(soundForUci('r3k2r/pppppppp/8/8/8/8/PPPPPPPP/R3K2R b KQkq - 0 1', 'e8c8')).toBe('castle');
  });

  it('rises on a promotion, with or without a capture', () => {
    expect(soundForUci('8/P6k/8/8/8/8/8/K7 w - - 0 1', 'a7a8q')).toBe('promote');
    expect(soundForUci('1r5k/P7/8/8/8/8/8/K7 w - - 0 1', 'a7b8n')).toBe('promote');
  });

  it('prefers check over a promotion or capture', () => {
    expect(soundForUci('7k/P7/8/8/8/8/8/K7 w - - 0 1', 'a7a8q')).toBe('check');
    expect(soundForUci('4k3/8/8/8/8/8/4p3/3RK3 b - - 0 1', 'e2d1q')).toBe('check');
  });

  it('is null for an illegal move', () => {
    expect(soundForUci(START, 'e2e5')).toBeNull();
  });
});

describe('soundBetween', () => {
  it('names the move that turns one position into the next', () => {
    const afterE4 = 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1';
    expect(soundBetween(START, afterE4)).toBe('piece');
    expect(soundBetween(START, 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR')).toBe('piece');
  });

  it('stays silent when the board is the same or jumped several moves', () => {
    expect(soundBetween(START, START)).toBeNull();
    expect(soundBetween(START, 'rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq e6 0 2')).toBeNull();
  });
});
