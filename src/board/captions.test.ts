import { describe, expect, it } from 'vitest';
import { captionFor } from './captions';

describe('captionFor captures', () => {
  it('describes an opponent capture from the user side', () => {
    expect(captionFor('4k3/8/8/3p4/4P3/8/8/4K3 b - - 0 1', 'd5e4', 'w')).toBe('takes your pawn');
  });

  it('describes a user capture', () => {
    expect(captionFor('4k3/8/8/8/8/8/b7/R3K3 w - - 0 1', 'a1a2', 'w')).toBe('you take the bishop');
  });

  it('counts en passant as taking a pawn', () => {
    expect(captionFor('4k3/8/8/3pP3/8/8/8/4K3 w - d6 0 1', 'e5d6', 'w')).toBe('you take the pawn');
  });

  it('adds check to a capture', () => {
    expect(captionFor('4r1k1/8/8/8/8/8/4N3/4K3 b - - 0 1', 'e8e2', 'w')).toBe('takes your knight, check');
  });
});

describe('captionFor check and mate', () => {
  it('says check', () => {
    expect(captionFor('4k3/8/8/8/8/8/8/R3K3 w - - 0 1', 'a1a8', 'w')).toBe('check');
    expect(captionFor('4k3/8/8/8/8/8/8/R3K3 w - - 0 1', 'a1a8', 'b')).toBe('check');
  });

  it('says checkmate', () => {
    expect(captionFor('6k1/5ppp/8/8/8/8/8/R3K3 w - - 0 1', 'a1a8', 'w')).toBe('checkmate');
  });

  it('says check for a discovered check', () => {
    // The rook on e1 is unmasked when the bishop leaves the e-file.
    expect(captionFor('4k3/8/8/8/4B3/8/8/4R1K1 w - - 0 1', 'e4d5', 'w')).toBe('check');
  });
});

describe('captionFor forks', () => {
  const knightFork = 'r3k3/8/8/3N4/8/8/8/4K3 w - - 0 1';

  it('forks the king and rook, without repeating check', () => {
    expect(captionFor(knightFork, 'd5c7', 'w')).toBe('forks the king and rook');
  });

  it('uses "your" when the opponent forks', () => {
    expect(captionFor(knightFork, 'd5c7', 'b')).toBe('forks your king and rook');
  });

  it('forks with a pawn', () => {
    expect(captionFor('3k4/8/8/3q1r2/8/8/4P3/4K3 w - - 0 1', 'e2e4', 'w')).toBe('forks the queen and rook');
  });

  it('counts two identical pieces', () => {
    expect(captionFor('4k3/8/1r3r2/8/8/4N3/8/4K3 w - - 0 1', 'e3d5', 'w')).toBe('forks the two rooks');
    expect(captionFor('r3k3/8/4r3/3N4/8/8/8/6K1 w - - 0 1', 'd5c7', 'w')).toBe('forks the king and two rooks');
  });

  it('does not count defended pieces of equal value', () => {
    // The knight on d4 hits a knight defended by b7 and a bishop defended by f7.
    expect(captionFor('4k3/1p3p2/2n1b3/8/8/5N2/8/4K3 w - - 0 1', 'f3d4', 'w')).toBe('');
  });
});

describe('captionFor pins', () => {
  it('pins a knight to the queen', () => {
    expect(captionFor('3q2k1/8/5n2/8/8/8/8/2B1K3 w - - 0 1', 'c1g5', 'w')).toBe('pins the knight to the queen');
  });

  it('pins a knight to the king', () => {
    expect(captionFor('4k3/8/2n5/8/2B5/8/8/4K3 w - - 0 1', 'c4b5', 'w')).toBe('pins the knight to the king');
    expect(captionFor('4k3/8/2n5/8/2B5/8/8/4K3 w - - 0 1', 'c4b5', 'b')).toBe('pins your knight to your king');
  });

  it('is not a pin when the piece behind is worth less', () => {
    expect(captionFor('3nk3/8/5r2/8/8/8/8/2B1K3 w - - 0 1', 'c1g5', 'w')).toBe('attacks the rook');
  });
});

describe('captionFor attacks', () => {
  it('attacks the queen', () => {
    expect(captionFor('4k3/8/3q4/8/8/8/3N4/4K3 w - - 0 1', 'd2e4', 'w')).toBe('attacks the queen');
    expect(captionFor('4k3/8/3q4/8/8/8/3N4/4K3 w - - 0 1', 'd2e4', 'b')).toBe('attacks your queen');
  });

  it('attacks an undefended piece of the same value', () => {
    expect(captionFor('4k3/8/8/4b3/8/8/8/2B1K3 w - - 0 1', 'c1f4', 'w')).toBe('attacks the bishop');
  });

  it('stays quiet when the same piece already attacked the target', () => {
    expect(captionFor('4k3/8/3q4/8/8/8/3R4/4K3 w - - 0 1', 'd2d1', 'w')).toBe('');
  });

  it('stays quiet about loose pawns', () => {
    expect(captionFor('4k3/8/8/4p3/8/8/8/4K1N1 w - - 0 1', 'g1f3', 'w')).toBe('');
  });
});

describe('captionFor special moves', () => {
  it('castles', () => {
    expect(captionFor('r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1', 'e1g1', 'w')).toBe('castles');
    expect(captionFor('r3k2r/8/8/8/8/8/8/R3K2R b KQkq - 0 1', 'e8c8', 'w')).toBe('castles');
  });

  it('promotes', () => {
    expect(captionFor('7k/P7/8/8/8/8/8/4K3 w - - 0 1', 'a7a8q', 'w')).toBe('promotes to a queen, check');
    expect(captionFor('7k/P7/8/8/8/8/8/4K3 w - - 0 1', 'a7a8n', 'w')).toBe('promotes to a knight');
  });

  it('promotes with a capture', () => {
    expect(captionFor('1r5k/P7/8/8/8/8/8/4K3 w - - 0 1', 'a7b8q', 'w')).toBe(
      'you take the rook, promotes to a queen, check',
    );
  });

  it('is empty for quiet moves', () => {
    const start = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
    expect(captionFor(start, 'e2e4', 'w')).toBe('');
    expect(captionFor(start, 'g1f3', 'w')).toBe('');
  });

  it('is empty for an illegal move', () => {
    expect(captionFor('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1', 'e2e5', 'w')).toBe('');
  });
});
