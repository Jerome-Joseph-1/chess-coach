import { describe, expect, it } from 'vitest';
import type { Game } from '../content/types';
import { findToast, gainPhrase, headline, holdMissHeadline, holdShare, opponentName } from './copy';
import { italian1, italian2 } from './testGames';

function withKinds(game: Game, turnIndex: number, kinds: Game['turns'][number]['kinds']): Game {
  return { ...game, turns: game.turns.map((t, i) => (i === turnIndex ? { ...t, kinds } : t)) };
}

describe('headline', () => {
  it('says what a win is worth and lists the moves that win it', () => {
    expect(headline(italian1, 1)).toBe('You could win two pawns: dxe5, then Bxd5 and Bxc6+.');
    expect(headline(italian1, 9)).toBe('You could win a piece: Rxe6+.');
  });

  it('says win back when the line only restores lost material', () => {
    expect(headline(italian1, 3)).toBe('You could win back a pawn: Qxd8+, then Rxe5+.');
  });

  it('leads with the win and adds the threat when the turn has both', () => {
    expect(headline(italian1, 7)).toBe(
      'You could win a piece: Nd3, then Bxe6 and Rxe6+. Black also threatened ...fxe5, winning your knight.',
    );
  });

  it('explains a defend turn by the piece that was threatened', () => {
    const game = withKinds(italian1, 7, ['defend']);
    expect(headline(game, 7)).toBe('Black threatened ...fxe5, winning your knight. Nd3 deals with it.');
  });

  it('explains a trap with how often players fall for it', () => {
    expect(headline(italian2, 1)).toBe(
      'Nxe5 looks natural — 20% of 1400 players play it — but ...Nxe5 wins your knight.',
    );
  });

  it('skips the popularity when the content has no share for the trap move', () => {
    const turns = italian2.turns.map((t, i) => (i === 1 ? { ...t, human: [] } : t));
    expect(headline({ ...italian2, turns }, 1)).toBe('Nxe5 looks natural, but ...Nxe5 wins your knight.');
  });

  it('describes a quiet turn by how many moves are fine', () => {
    expect(headline(italian1, 11)).toBe('All quiet: 98% of the moves 1400 players choose here are fine.');
    expect(headline(italian1, 13)).toBe('All quiet: 100% of the moves 1400 players choose here are fine.');
  });

  it('falls back to the best move when no kind applies', () => {
    expect(headline(withKinds(italian1, 3, []), 3)).toBe('The strong move here is Qxd8+.');
  });

  it('names White as the opponent when the user plays Black', () => {
    expect(opponentName(italian1)).toBe('Black');
    expect(opponentName({ ...italian1, side: 'b' })).toBe('White');
  });
});

describe('gainPhrase', () => {
  it('names the usual amounts', () => {
    expect([1, 2, 3, 5, 9].map(gainPhrase)).toEqual(['a pawn', 'two pawns', 'a piece', 'a rook', 'the queen']);
  });
});

describe('findToast', () => {
  it('shares how few players find a move that most miss', () => {
    expect(findToast(italian1.turns[1], 1400)).toBe('Only 44% of 1400 players find this');
    expect(findToast(italian1.turns[7], 1400)).toBe('Only 12% of 1400 players find this');
  });

  it('praises a move that most players find', () => {
    expect(findToast(italian1.turns[3], 1400)).toBe('Nice find!');
  });

  it('only counts human moves that hold', () => {
    expect(holdShare(italian1.turns[1])).toBeCloseTo(0.436);
  });
});

describe('holdMissHeadline', () => {
  it('names the move, the reply and the move that holds', () => {
    expect(holdMissHeadline(italian1, 3, 'b1d2')).toBe('Nbd2 loses ground: Black plays ...Nd6. Qxd8+ holds.');
  });

  it('still reads well without a recorded reply', () => {
    expect(holdMissHeadline(italian1, 3, 'd1e2')).toBe('Qe2 loses ground. Qxd8+ holds.');
  });
});
