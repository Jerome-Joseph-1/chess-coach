import { describe, expect, it } from 'vitest';
import { lineSequence, revealSequence } from './lines';
import { playLine, samePosition, sanOf, uciOfSan } from './position';
import { italian1 } from './testGames';

describe('revealSequence', () => {
  const turn = italian1.turns[3];
  const best = turn.lines.best!;

  it('plays the best line from the pause position', () => {
    const { steps } = revealSequence(italian1, 3, null);
    expect(steps.map((s) => s.uci)).toEqual(best.slice(0, steps.length));
    expect(steps[0].before).toBe(turn.fen);
    expect(steps.every((s) => s.tone === 'best' && !s.note)).toBe(true);
  });

  it("leads with the user's losing move and the answer, then the best line from the pause position", () => {
    const { steps } = revealSequence(italian1, 3, 'b1d2');
    expect(steps.slice(0, 2).map((s) => s.uci)).toEqual(['b1d2', turn.refutations.b1d2[0]]);
    expect(steps.slice(0, 2).every((s) => s.tone === 'mistake')).toBe(true);
    expect(steps.slice(2).every((s) => s.tone === 'best')).toBe(true);
    expect(steps[2].before).toBe(turn.fen);
    expect(steps[2].uci).toBe(best[0]);
  });

  it('plays on until the piece is gone when the line shows a loss, and no further', () => {
    const { steps } = revealSequence(italian1, 3, 'd1d5');
    const mistake = steps.filter((s) => s.tone === 'mistake');
    expect(mistake).toHaveLength(6);
    expect(mistake.at(-1)!.san).toBe('Bxd5');
    expect(steps[6].before).toBe(turn.fen);
  });

  it('says what goes wrong at the step where the piece is lost', () => {
    const { steps } = revealSequence(italian1, 3, 'd1d5');
    expect(steps[0].note).toBe('Your move');
    expect(steps[5].note).toBe('That loses your queen.');
    expect(steps.slice(1, 5).every((s) => !s.note)).toBe(true);
  });

  it('does not say a piece is lost when the line does not show it', () => {
    const { steps } = revealSequence(italian1, 3, 'b1d2');
    expect(steps[1].note).toBe("That's a mistake: it gives Black the upper hand.");
    expect(steps.map((s) => s.note).join(' ')).not.toMatch(/loses/);
  });

  it('calls the first move of the best line the better one after a mistake', () => {
    const { steps } = revealSequence(italian1, 3, 'b1d2');
    const first = steps.find((s) => s.tone === 'best')!;
    expect(first.note).toMatch(/^The better move/);
  });

  it('leaves the mistake out when no answer to it is recorded', () => {
    const { steps } = revealSequence(italian1, 3, 'd1e2');
    expect(steps.every((s) => s.tone === 'best')).toBe(true);
  });

  it('follows the turn it is asked about', () => {
    expect(revealSequence(italian1, 7, null).steps[0].before).toBe(italian1.turns[7].fen);
  });

  it('plays the line it is given when the turn has none, and only then', () => {
    const plan = ['c4d5', 'c6d4'];
    const bare = { ...italian1, turns: italian1.turns.map((t, i) => (i === 3 ? { ...t, lines: { best: [] } } : t)) };
    expect(revealSequence(bare, 3, null).steps).toEqual([]);
    expect(revealSequence(bare, 3, null, plan).steps.map((s) => s.uci)).toEqual(plan);
    expect(revealSequence(italian1, 3, null, plan)).toEqual(revealSequence(italian1, 3, null));
  });
});

describe('lineSequence', () => {
  it('plays a single line in one colour', () => {
    const { steps } = lineSequence(italian1.turns[3].fen, ['d1d5', ...italian1.turns[3].refutations.d1d5], 'mistake');
    expect(steps.length).toBeGreaterThan(2);
    expect(steps.every((s) => s.tone === 'mistake')).toBe(true);
  });
});

describe('position helpers', () => {
  it('turns SAN into uci, including castling', () => {
    const turn = italian1.turns[2];
    expect(uciOfSan(turn.fen, 'O-O')).toBe('e1g1');
    expect(uciOfSan(turn.fen, 'Qh5')).toBe('');
  });

  it('plays a line until a move is illegal', () => {
    const turn = italian1.turns[3];
    const line = playLine(turn.fen, ['d1d8', 'c6d8', 'a1a8', 'f1e1']);
    expect(line.map((m) => m.san)).toEqual(['Qxd8+', 'Nxd8']);
    expect(line[0].captured).toBe('q');
    expect(line[0].side).toBe('w');
  });

  it('falls back to the uci text for an illegal move', () => {
    expect(sanOf(italian1.turns[3].fen, 'a1a8')).toBe('a1a8');
  });

  it('compares pieces and side to move only', () => {
    expect(samePosition('8/8/8/8/8/8/8/K6k w - - 0 1', '8/8/8/8/8/8/8/K6k w - - 5 9')).toBe(true);
    expect(samePosition('8/8/8/8/8/8/8/K6k w - - 0 1', '8/8/8/8/8/8/8/K6k b - - 0 1')).toBe(false);
  });
});
