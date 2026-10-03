import { describe, expect, it } from 'vitest';
import { playLine } from '../pause/position';
import type { Line } from './engine';
import { playedNote, rowsFor, shortReason, shortfall, untilCapturesStop, verdict } from './explain';
import type { Score } from './score';

const line = (pv: string[], score: Score): Line => ({ pv, score, depth: 18 });

// Black to move; the knight on d6 hits the rook on e8, which the bishop on d7 guards.
const KNIGHT_HITS_ROOK = '4r1k1/3b1ppp/3N4/8/8/8/5PPP/6K1 b - - 0 21';
const rookAway = line(['e8e6', 'd6b5', 'g8f8'], { cp: -40 });
const ignoresIt = line(['h7h6', 'd6e8', 'd7e8', 'g2g3', 'g8h7'], { cp: -220 });

// White to move; the pawn on e4 is loose and the knight on f6 hits it.
const LOOSE_PAWN = '6k1/5ppp/5n2/8/4P3/8/3P1PPP/6K1 w - - 0 30';
const defends = line(['d2d3', 'g8f8'], { cp: 10 });
const dropsIt = line(['h2h3', 'f6e4', 'g1h2', 'g8f8'], { cp: -95 });

// White to move; the knight on d5 hangs to the rook.
const HANGING_KNIGHT = '6k1/5ppp/8/3n4/8/8/5PPP/3R2K1 w - - 0 25';
const takes = line(['d1d5', 'g8f8'], { cp: 320 });
const waits = line(['h2h3', 'd5f4'], { cp: 20 });

describe('untilCapturesStop', () => {
  const fen = KNIGHT_HITS_ROOK;

  it('stops after two quiet moves once the captures have started', () => {
    expect(untilCapturesStop(playLine(fen, ignoresIt.pv)).map((m) => m.san)).toEqual(['h6', 'Nxe8', 'Bxe8']);
  });

  it('is empty for a line without captures', () => {
    expect(untilCapturesStop(playLine(fen, rookAway.pv))).toEqual([]);
  });

  it('takes in a recapture just past the window, so a trade is never cut in half', () => {
    const start = 'r6k/8/8/8/8/8/8/R1R3K1 w - - 0 1';
    const moves = playLine(start, ['g1g2', 'h8h7', 'g2g1', 'h7h8', 'g1g2', 'h8h7', 'g2g1', 'a8a1', 'c1a1']);
    expect(untilCapturesStop(moves)).toHaveLength(9);
  });
});

describe('shortfall', () => {
  it('names the exchange and the capture that wins it', () => {
    const loss = shortfall(KNIGHT_HITS_ROOK, rookAway, ignoresIt)!;
    expect(loss.phrase).toBe('loses the exchange');
    expect(loss.key?.san).toBe('Nxe8');
    expect(loss.captures.map((m) => m.san)).toEqual(['Nxe8', 'Bxe8']);
  });

  it('says a pawn is dropped', () => {
    expect(shortfall(LOOSE_PAWN, defends, dropsIt)).toMatchObject({ phrase: 'drops a pawn', key: { san: 'Nxe4' } });
  });

  it('says what the better move would have won', () => {
    expect(shortfall(HANGING_KNIGHT, takes, waits)?.phrase).toBe("doesn't win a knight");
  });

  it('names both what the better move takes and what this one drops', () => {
    // White has just taken on f7 with check: Kxf7 wins the bishop back, Ke7 leaves it and drops a pawn too.
    const fen = 'r1bqkb1r/pppp1Bpp/2n5/4p3/3Pn3/5N2/PPP2PPP/RNBQK2R b KQkq - 0 5';
    const takesBack = line(['e8f7', 'd4d5', 'c6e7', 'f3e5'], { cp: 440 });
    const walksAway = line(['e8e7', 'd4e5', 'd7d6', 'b1d2'], { cp: -360 });
    expect(shortfall(fen, takesBack, walksAway)).toMatchObject({ phrase: "doesn't win a bishop and drops a pawn", key: { san: 'dxe5' } });
  });

  it('finds nothing when the material comes out even', () => {
    expect(shortfall(LOOSE_PAWN, dropsIt, defends)).toBeNull();
    expect(shortfall(LOOSE_PAWN, defends, defends)).toBeNull();
  });
});

describe('shortReason', () => {
  it('names the material and the capture when the engine also rates it worse', () => {
    expect(shortReason(KNIGHT_HITS_ROOK, rookAway, ignoresIt)).toBe('loses the exchange: Nxe8');
    expect(shortReason(LOOSE_PAWN, defends, dropsIt)).toBe('drops a pawn: Nxe4');
  });

  it('puts mates first', () => {
    expect(shortReason(LOOSE_PAWN, defends, line(['h2h3'], { mate: -2 }))).toBe('allows mate in 2');
    expect(shortReason(LOOSE_PAWN, line(['d2d3'], { mate: 3 }), defends)).toBe('misses mate in 3');
  });

  it('falls back to the score when no material changes hands, and never invents a tactic', () => {
    const quiet = (cp: number) => line(['g2g3', 'g8f8'], { cp });
    expect(shortReason(LOOSE_PAWN, defends, quiet(-60))).toBe('slightly worse position');
    expect(shortReason(LOOSE_PAWN, defends, quiet(-200))).toBe('much worse position');
    expect(shortReason(LOOSE_PAWN, defends, quiet(0))).toBeNull();
  });

  it('does not call a loss of material by name when the engine barely minds it', () => {
    expect(shortReason(LOOSE_PAWN, defends, line(dropsIt.pv, { cp: -10 }))).toBeNull();
  });
});

describe('rowsFor', () => {
  it('puts the reference first as Best and measures the others against it', () => {
    const rows = rowsFor(KNIGHT_HITS_ROOK, rookAway, [ignoresIt], rookAway);
    expect(rows.map(({ san, score, detail, isRef }) => ({ san, score, detail, isRef }))).toEqual([
      { san: 'Re6', score: 'Best', detail: 'then Nb5 Kf8', isRef: true },
      { san: 'h6', score: '−1.8', detail: 'loses the exchange: Nxe8', isRef: false },
    ]);
  });

  it('marks the line move as Played when the engine prefers another, which then scores above it', () => {
    const better = line(['e8c8', 'd6c8', 'd7c8'], { cp: -10 });
    const rows = rowsFor(KNIGHT_HITS_ROOK, rookAway, [better], better);
    expect(rows.map((row) => row.score)).toEqual(['Played', '+0.3']);
  });

  it('shows mates as words', () => {
    const mating = line(['d2d3'], { mate: 3 });
    const rows = rowsFor(LOOSE_PAWN, mating, [line(['h2h3'], { mate: -2 })], mating);
    expect(rows.map(({ score, detail }) => [score, detail])).toEqual([
      ['mate in 3', ''],
      ['', 'allows mate in 2'],
    ]);
  });
});

describe('verdict', () => {
  it('says how much worse, what it loses and after which captures', () => {
    expect(verdict(KNIGHT_HITS_ROOK, rookAway, ignoresIt, true)).toBe('21… h6 is 1.8 worse than Re6: it loses the exchange after Nxe8 Bxe8.');
  });

  it('stays with the score when no material is lost', () => {
    expect(verdict(LOOSE_PAWN, defends, line(['g2g3', 'g8f8'], { cp: -60 }), false)).toBe('30. g3 is 0.7 worse than d3.');
  });

  it('calls close moves equal and owns up when the engine likes the try better', () => {
    expect(verdict(LOOSE_PAWN, defends, line(['g2g3'], { cp: 0 }), false)).toBe('30. g3 is about as good as d3.');
    expect(verdict(LOOSE_PAWN, defends, line(['g2g3'], { cp: 90 }), true)).toBe('The engine rates 30. g3 0.8 better than d3.');
  });

  it('recognises the same move', () => {
    expect(verdict(LOOSE_PAWN, defends, defends, true)).toBe('30. d3 is the move in the line.');
    expect(verdict(LOOSE_PAWN, defends, defends, false)).toBe("30. d3 is the engine's choice.");
  });

  it('talks about mates plainly', () => {
    expect(verdict(LOOSE_PAWN, defends, line(['h2h3'], { mate: -2 }), false)).toBe('30. h3 allows mate in 2.');
    expect(verdict(LOOSE_PAWN, line(['g2g3'], { mate: 4 }), defends, false)).toBe('30. d3 misses mate in 4 with g3.');
  });

  it('says checkmate when the move mates', () => {
    const backRank = '6k1/5ppp/8/8/8/8/5PPP/3R2K1 w - - 0 40';
    expect(verdict(backRank, line(['g2g3'], { cp: 600 }), line(['d1d8'], { mate: 1 }), false)).toBe('40. Rd8# is checkmate.');
  });
});

describe('playedNote', () => {
  it('agrees when the line move is the engine pick', () => {
    expect(playedNote(KNIGHT_HITS_ROOK, rookAway, rookAway)).toBe('The engine picks Re6 here too.');
  });

  it('says so plainly when the engine prefers another move', () => {
    expect(playedNote(LOOSE_PAWN, line(['g2g3'], { cp: 0 }), defends)).toBe('The engine slightly prefers d3 here; both are fine.');
    expect(playedNote(LOOSE_PAWN, line(['g2g3'], { cp: -80 }), defends)).toBe('The engine prefers d3 here, by 0.9.');
    expect(playedNote(LOOSE_PAWN, defends, line(['g2g3'], { mate: 5 }))).toBe('The engine finds mate in 5 with g3 here.');
  });
});
