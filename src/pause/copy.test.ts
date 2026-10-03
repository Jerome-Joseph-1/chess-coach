import { describe, expect, it } from 'vitest';
import type { Game } from '../content/types';
import {
  findToast,
  gainPhrase,
  guidedTitle,
  headline,
  holdMissHeadline,
  holdShare,
  holdSub,
  opponentName,
  quietReveal,
  spotSub,
} from './copy';
import { italian1, italian2 } from './testGames';

function withKinds(game: Game, turnIndex: number, kinds: Game['turns'][number]['kinds']): Game {
  return { ...game, turns: game.turns.map((t, i) => (i === turnIndex ? { ...t, kinds } : t)) };
}

describe('headline', () => {
  it('says what a win is worth and the moves that win it', () => {
    expect(headline(italian1, 1)).toBe('You could win two pawns with dxe5, then Bxd5 and Bxc6+.');
    expect(headline(italian1, 9)).toBe('You could win a piece with Rxe6+.');
  });

  it('says win back when the line only restores lost material', () => {
    expect(headline(italian1, 3)).toBe('You could win back a pawn with Qxd8+, then Rxe5+.');
  });

  it('leads with the win and adds the threat when the turn has both', () => {
    expect(headline(italian1, 7)).toBe(
      'You could win a piece with Nd3, then Bxe6 and Rxe6+. Black was also threatening to take your knight on e5.',
    );
  });

  it('explains a defend turn by the piece that was threatened and the move that saves it', () => {
    const game = withKinds(italian1, 7, ['defend']);
    expect(headline(game, 7)).toBe('Black was threatening to take your knight on e5. Nd3 saves it.');
  });

  it('explains a trap with how often players fall for it', () => {
    expect(headline(italian2, 1)).toBe(
      'Nxe5 looks free, but Black wins your knight with ...Nxe5. 20% of players rated 1400 fall for it.',
    );
  });

  it('skips the popularity when the content has no share for the trap move', () => {
    const turns = italian2.turns.map((t, i) => (i === 1 ? { ...t, human: [] } : t));
    expect(headline({ ...italian2, turns }, 1)).toBe('Nxe5 looks free, but Black wins your knight with ...Nxe5.');
  });

  it('says nothing special for a quiet turn', () => {
    expect(headline(italian1, 11)).toBe('Nothing special. Any normal move is fine here.');
    expect(headline(italian1, 13)).toBe('Nothing special. Any normal move is fine here.');
  });

  it('falls back to the best move when no kind applies', () => {
    expect(headline(withKinds(italian1, 3, []), 3)).toBe('The strong move here is Qxd8+.');
  });

  it('names White as the opponent when the user plays Black', () => {
    expect(opponentName(italian1)).toBe('Black');
    expect(opponentName({ ...italian1, side: 'b' })).toBe('White');
  });
});

describe('spotSub', () => {
  it('says what the opponent just did', () => {
    expect(spotSub(italian1, 3)).toBe('Black just took back on e5. Take a look before you move.');
    expect(spotSub(italian1, 1)).toBe('Black just took your pawn on e4. Take a look before you move.');
    expect(spotSub(italian1, 18)).toBe('Black just put you in check. Take a look before you move.');
    expect(spotSub(italian1, 11)).toBe('Black just played Nf5. Take a look before you move.');
  });

  it('takes back on the square of the latest capture, even a move later', () => {
    expect(spotSub(italian1, 9)).toBe('Black just took back on e6. Take a look before you move.');
  });
});

describe('quietReveal', () => {
  it('confirms a right answer and gently corrects a wrong one', () => {
    expect(quietReveal(false)).toBe('Right. Nothing special here — any normal move is fine.');
    expect(quietReveal(true)).toBe('Actually, nothing special here. Any normal move is fine.');
  });
});

describe('prompts', () => {
  it('names the opponent in the follow-through prompt', () => {
    expect(holdSub(italian1)).toBe("Black has answered. What's your next move?");
    expect(holdSub({ ...italian1, side: 'b' })).toBe("White has answered. What's your next move?");
  });

  it('asks for the scripted move in the guided step', () => {
    expect(guidedTitle('Qxd8+')).toBe('Play it: Qxd8+');
  });
});

describe('gainPhrase', () => {
  it('names the usual amounts', () => {
    expect([1, 2, 3, 5, 9].map(gainPhrase)).toEqual(['a pawn', 'two pawns', 'a piece', 'a rook', 'the queen']);
  });
});

describe('findToast', () => {
  it('shares how few players find a move that most miss', () => {
    expect(findToast(italian1.turns[1], 1400)).toBe('Only 44% of players rated 1400 find this.');
    expect(findToast(italian1.turns[7], 1400)).toBe('Only 12% of players rated 1400 find this.');
  });

  it('praises a move that most players find', () => {
    expect(findToast(italian1.turns[3], 1400)).toBe('Good find.');
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
