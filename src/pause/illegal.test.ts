import { Chess } from 'chess.js';
import { describe, expect, it } from 'vitest';
import { illegalLine } from './illegal';

const START = new Chess().fen();

describe('illegalLine', () => {
  it('names the piece and the square it cannot reach', () => {
    expect(illegalLine(START, 'w', 'e2', 'e5')).toBe("Your pawn on e2 can't go to e5.");
    expect(illegalLine(START, 'b', 'g8', 'g6')).toBe("Your knight on g8 can't go to g6.");
  });

  it('says why a piece cannot move at all', () => {
    expect(illegalLine(START, 'w', 'c1', null)).toBe("Your bishop on c1 can't move: your own pieces are in the way.");
    expect(illegalLine('4k3/8/8/8/4p3/4P3/8/4K3 w - - 0 1', 'w', 'e3', null)).toBe('Your pawn on e3 is blocked.');
  });

  it('explains a pinned piece', () => {
    const pinned = '4r1k1/8/8/8/8/8/4N3/4K3 w - - 0 1';
    expect(illegalLine(pinned, 'w', 'e2', 'c3')).toBe("Your knight on e2 can't go to c3: that would leave your king in check.");
    expect(illegalLine(pinned, 'w', 'e2', null)).toBe("Your knight on e2 can't move: that would leave your king in check.");
  });

  it('explains a move that leaves the king in check', () => {
    expect(illegalLine('4k3/8/8/8/8/8/3N4/r3K3 w - - 0 1', 'w', 'd2', 'f3')).toBe("Your knight on d2 can't go to f3: your king is in check.");
  });

  it('explains a king that would step into check', () => {
    expect(illegalLine('4k3/8/8/8/8/8/r7/4K3 w - - 0 1', 'w', 'e1', 'e2')).toBe("Your king on e1 can't go to e2: it would be in check there.");
  });
});
