import { describe, expect, it } from 'vitest';
import type { Game, StepOutcome, Turn } from '../content/types';
import {
  HINTED,
  MISSED,
  findNote,
  headline,
  holdMissHeadline,
  holdSub,
  mistakeVerdict,
  opponentName,
  piecesPhrase,
  resultLine,
  spotSub,
  stepLabel,
  winSentence,
} from './copy';
import queenForKnight from './fixtures/queen-for-knight.json';
import olderItalian from './fixtures/italian-1400-0003.json';
import { playLine } from './position';
import { italian1, italian2 } from './testGames';

const START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
const fixtureGame = (json: unknown) => json as Game;

/** A one-turn game from a position, for sentences that depend on the lines only. */
function gameWith(fen: string, lines: Turn['lines'], kinds: Turn['kinds'] = ['win']): Game {
  const turn = { ...italian1.turns[0], fen, lines, kinds, human: [], mistakeMove: lines.mistake?.[0] ?? null };
  return { ...italian1, side: 'w', turns: [turn] };
}

const best = (fen: string, moves: string[]) => winSentence('w', { fen, lines: { best: moves } });

function withKinds(game: Game, turnIndex: number, kinds: Game['turns'][number]['kinds']): Game {
  return { ...game, turns: game.turns.map((t, i) => (i === turnIndex ? { ...t, kinds } : t)) };
}

describe('headline', () => {
  it('says what a win is worth and the moves that win it', () => {
    expect(headline(italian1, 1)).toBe('You could win two pawns with dxe5, then Bxd5 and Bxc6+.');
    expect(headline(italian1, 9)).toBe('You could win a bishop with Rxe6+.');
  });

  it('says win back when the line only restores lost material', () => {
    expect(headline(italian1, 3)).toBe('You could win back a pawn with Qxd8+, then Rxe5+.');
  });

  it('leads with the win and adds the threat when the turn has both', () => {
    expect(headline(italian1, 7)).toBe(
      'You could win a knight with Nd3, then Bxe6 and Rxe6+. Black was also threatening to take your knight on e5.',
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

describe('resultLine', () => {
  const right = (...steps: StepOutcome['step'][]): StepOutcome[] => steps.map((step) => ({ step, correct: true }));

  it('says what the user found, by how far this depth goes', () => {
    expect(resultLine('pause', 1, right('spot'))).toEqual({ kind: 'success', text: 'You spotted it' });
    expect(resultLine('pause', 2, right('spot', 'find')).text).toBe('You spotted it and found the piece');
    expect(resultLine('pause', 3, right('spot', 'find', 'solve'))).toEqual({
      kind: 'success',
      text: 'You spotted it and found the move',
    });
  });

  it('says missed it as soon as one step was missed', () => {
    const outcomes: StepOutcome[] = [...right('spot', 'find'), { step: 'solve', correct: false }];
    expect(resultLine('pause', 3, outcomes)).toBe(MISSED);
    expect(MISSED.text).toBe('Missed it');
    expect(resultLine('pause', 1, [{ step: 'spot', correct: false }])).toBe(MISSED);
  });

  it('says solved with a hint, neutral, when hints carried the user through', () => {
    const outcomes: StepOutcome[] = [
      { step: 'spot', correct: true },
      { step: 'find', correct: false },
    ];
    expect(resultLine('pause', 2, outcomes, true)).toBe(HINTED);
    expect(HINTED).toEqual({ kind: 'quiet', text: 'Solved with a hint' });
    expect(resultLine('pause', 2, outcomes)).toBe(MISSED);
    expect(resultLine('pause', 2, outcomes.map((o) => ({ ...o, correct: true })), true).kind).toBe('success');
  });

  it('keeps a quiet position neutral whatever the answer was', () => {
    expect(resultLine('nothing', 3, right('spot'))).toEqual({ kind: 'quiet', text: 'You saw it was quiet' });
    expect(resultLine('nothing', 3, [{ step: 'spot', correct: false }])).toEqual({ kind: 'quiet', text: 'This one was quiet' });
  });
});

describe('stepLabel', () => {
  it('counts the step in hand out of the steps this depth asks', () => {
    expect(stepLabel(1, 3)).toBe('Step 1 of 3');
  });
});

describe('prompts', () => {
  it('names the opponent in the follow-through prompt', () => {
    expect(holdSub(italian1)).toBe("Black has answered. What's your next move?");
    expect(holdSub({ ...italian1, side: 'b' })).toBe("White has answered. What's your next move?");
  });
});

describe('piecesPhrase', () => {
  it('names the pieces, biggest first, and counts repeats', () => {
    expect(piecesPhrase(['p'])).toBe('a pawn');
    expect(piecesPhrase(['p', 'p'])).toBe('two pawns');
    expect(piecesPhrase(['q'])).toBe('the queen');
    expect(piecesPhrase(['n', 'b'])).toBe('a knight and a bishop');
    expect(piecesPhrase(['p', 'r', 'n'])).toBe('a rook, a knight and a pawn');
    expect(piecesPhrase(['n', 'p', 'p'])).toBe('a knight and two pawns');
  });
});

describe('findNote', () => {
  it('shares how few players at this level pick a move that holds', () => {
    expect(findNote(italian1.turns[1], 1400)).toBe('Only 44% of players rated 1400 find this.');
    expect(findNote(italian1.turns[7], 1400)).toBe('Only 12% of players rated 1400 find this.');
  });

  it('just says right when most players find the move', () => {
    expect(findNote(italian1.turns[3], 1400)).toBe('Right.');
  });
});

describe('holdMissHeadline', () => {
  it('names the move, the reply and the move that holds, without claiming a loss the line does not show', () => {
    expect(holdMissHeadline(italian1, 3, 'b1d2')).toBe('Nbd2 is a mistake: Black plays ...Nd6. Qxd8+ holds.');
  });

  it('still reads well without a recorded reply', () => {
    expect(holdMissHeadline(italian1, 3, 'd1e2')).toBe('Qe2 is a mistake. Qxd8+ holds.');
  });

  it('names the piece when the line shows the user down material', () => {
    expect(holdMissHeadline(italian1, 3, 'd1d5')).toBe('Qd5 loses your queen: Black plays ...Bxd5. Qxd8+ holds.');
    expect(holdMissHeadline(italian1, 5, 'b1c3')).toBe('Nc3 loses your knight: Black plays ...fxe5. Re1 holds.');
  });

  it('never says material is lost when the line ends level', () => {
    const level = holdMissHeadline(italian1, 3, 'c4b5');
    expect(level).toBe('Bb5 is a mistake: Black plays ...Qxd1. Qxd8+ holds.');
    expect(level).not.toMatch(/loses/);
  });
});

describe('winSentence', () => {
  it('names a knight won for a pawn, not the net two pawns', () => {
    expect(best('r2qkb1r/ppp2ppp/3p1n2/n2Pp3/4P1b1/3B1N2/PPP2PPP/RNBQK2R w KQkq - 3 7', ['b2b4', 'c7c6', 'b4a5', 'c6d5'])).toBe(
      'You could win a knight for a pawn: b4, then bxa5.',
    );
  });

  it('names a clean rook win by the moves that make it', () => {
    expect(best('6k1/3r1p1p/8/8/4N3/8/5PPP/6K1 w - - 0 1', ['e4f6', 'g8g7', 'f6d7'])).toBe('You could win a rook with Nf6+, then Nxd7.');
  });

  it('names two pieces', () => {
    expect(best('6k1/p7/8/R1n3b1/8/8/8/6K1 w - - 0 1', ['a5c5', 'a7a6', 'c5g5'])).toBe(
      'You could win a knight and a bishop with Rxc5, then Rxg5+.',
    );
  });

  it('says win back when the user is behind and only restores the balance', () => {
    expect(best('n3k3/8/8/3p4/8/5B2/8/4K3 w - - 0 1', ['f3d5'])).toBe('You could win back a pawn with Bxd5.');
  });

  it('does not call a lead a win back', () => {
    expect(best('4k3/8/8/3p4/8/5B2/8/4K3 w - - 0 1', ['f3d5'])).toBe('You could win a pawn with Bxd5.');
  });

  it('counts a piece for the same piece as a trade, so no win', () => {
    expect(best('1b2k3/8/8/4n3/8/3N4/8/4K3 w - - 0 1', ['d3e5', 'b8e5'])).toBe('The strong move here is Nxe5.');
  });

  it('keeps checkmate as it was', () => {
    expect(best('6k1/5ppp/8/8/8/8/8/R5K1 w - - 0 1', ['a1a8'])).toBe('You could checkmate with Ra8#.');
  });

  it('falls back to the strong move when nothing is taken', () => {
    expect(best(START, ['e2e4', 'e7e5'])).toBe('The strong move here is e4.');
  });

  it('names the queen won for a knight and a pawn, not a rook', () => {
    const game = fixtureGame(queenForKnight);
    const turn = game.turns.find((t) => t.ply === 23)!;
    expect(turn.fen).toBe('r1bq1rk1/bpp2p2/p1np3p/4P3/2BPN3/5Q2/PP3PPP/R3R1K1 w - - 0 15');
    expect(headline(game, game.turns.indexOf(turn))).toBe('You could win the queen for a knight and a pawn: Nf6+, then exf6.');
  });

  it('names the queen and a knight won for a rook', () => {
    expect(headline(italian2, 17)).toBe('You could win the queen and a knight for a rook: Re1, then Qxe1 and Qxd5.');
  });

  it('says a knight is won in the game the user reported, not two pawns', () => {
    const game = fixtureGame(olderItalian);
    const index = game.turns.findIndex((t) => t.fen.startsWith('r2qkb1r/ppp2ppp/3p1n2/n2Pp3/4P1b1/3B1N2/PPP2PPP/RNBQK2R'));
    expect(index).toBeGreaterThanOrEqual(0);
    const text = headline(game, index);
    expect(text).toBe('You could win a knight for a pawn: b4, then bxa5.');
    expect(text).not.toMatch(/two pawns/);
  });
});

describe('honest mistakes', () => {
  const quiet = gameWith(START, { mistake: ['a2a3', 'a7a6'] }, ['trap']);

  it('does not claim a loss when the line shows no material going down', () => {
    const text = headline(quiet, 0);
    expect(text).toBe('a3 looks fine, but it gives Black the upper hand.');
    expect(text).not.toMatch(/loses/);
  });

  it('does not claim a loss in the second sentence either', () => {
    const both = gameWith(START, { best: ['e2e4'], mistake: ['a2a3', 'a7a6'] }, ['win', 'trap']);
    const text = headline(both, 0);
    expect(text).toBe('The strong move here is e4. a3 looks natural, but it gives Black the upper hand.');
    expect(text).not.toMatch(/loses material/);
  });

  it('names the piece when the line shows it lost', () => {
    expect(headline(italian2, 1)).toBe(
      'Nxe5 looks free, but Black wins your knight with ...Nxe5. 20% of players rated 1400 fall for it.',
    );
    const both = { ...italian2, turns: italian2.turns.map((t, i) => (i === 1 ? { ...t, kinds: ['win', 'trap'] as Turn['kinds'] } : t)) };
    expect(headline(both, 1)).toContain('Nxe5 looks natural, but Black wins your knight with ...Nxe5.');
  });

  it('explains a mistake line at the step where the piece goes, else at the answer', () => {
    const turn = italian1.turns[3];
    const loses = playLine(turn.fen, ['d1d5', ...turn.refutations.d1d5]);
    expect(mistakeVerdict(italian1, turn.fen, loses)).toEqual({ at: 5, text: 'That loses your queen.' });
    const level = playLine(turn.fen, ['b1d2', ...turn.refutations.b1d2]);
    expect(mistakeVerdict(italian1, turn.fen, level)).toEqual({
      at: 1,
      text: "That's a mistake: it gives Black the upper hand.",
    });
  });

  it('names White when the user plays Black', () => {
    const turn = italian1.turns[3];
    const line = playLine(turn.fen, ['b1d2', ...turn.refutations.b1d2]);
    expect(mistakeVerdict({ ...italian1, side: 'b' }, turn.fen, line).text).toBe("That's a mistake: it gives White the upper hand.");
  });
});
