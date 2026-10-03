import { describe, expect, it } from 'vitest';
import { openingLine, revealLines } from './lines';
import { flipTurn, playLine, samePosition, sanOf, uciOfSan } from './position';
import { italian1, italian2 } from './testGames';

describe('revealLines', () => {
  const turn = italian1.turns[3];

  it('offers the best line, the common mistake and the threat, in that order', () => {
    const lines = revealLines(italian1, 3);
    expect(lines.map((l) => l.id)).toEqual(['best', 'mistake', 'threat']);
    expect(lines.map((l) => l.label)).toEqual(['Best line', 'Common mistake', "Black's threat"]);
  });

  it("names the opponent after the user's side", () => {
    const asBlack = { ...italian1, side: 'b' as const };
    expect(revealLines(asBlack, 3).at(-1)?.label).toBe("White's threat");
  });

  it('starts the threat line with the opponent to move and no en passant square', () => {
    const threat = revealLines(italian1, 3).find((l) => l.id === 'threat')!;
    expect(threat.fen).toBe(flipTurn(turn.fen));
    expect(threat.fen.split(' ')[1]).toBe('b');
    expect(threat.fen.split(' ')[3]).toBe('-');
  });

  it("adds the user's losing move with its refutation, and drops the mistake it repeats", () => {
    const lines = revealLines(italian1, 3, 'c4f7');
    expect(lines.map((l) => l.id)).toEqual(['best', 'yours', 'threat']);
    expect(lines[1].moves).toEqual(['c4f7', ...turn.refutations.c4f7]);
  });

  it('keeps the common mistake when the user played something else', () => {
    expect(revealLines(italian1, 3, 'b1d2').map((l) => l.id)).toEqual(['best', 'yours', 'mistake', 'threat']);
  });

  it('skips the user line when no refutation is recorded', () => {
    expect(revealLines(italian1, 3, 'd1e2').map((l) => l.id)).toEqual(['best', 'mistake', 'threat']);
  });

  it('labels a later-turn miss as a refutation', () => {
    expect(revealLines(italian1, 3, 'b1d2', 'refutation').map((l) => l.id)).toContain('refutation');
  });

  it('leaves out lines the turn does not have', () => {
    const ids = revealLines(italian1, 18).map((l) => l.id);
    expect(ids).toEqual(['best']);
  });
});

describe('openingLine', () => {
  it('opens on the line that backs the headline', () => {
    expect(openingLine(italian1.turns[3])).toBe('best');
    expect(openingLine({ ...italian1.turns[7], kinds: ['defend'] })).toBe('threat');
    expect(openingLine(italian2.turns[1])).toBe('mistake');
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
