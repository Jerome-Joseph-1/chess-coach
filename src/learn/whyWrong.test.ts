import { describe, expect, it } from 'vitest';
import type { Game, Side, Turn } from '../content/types';
import { italian1 } from '../pause/testGames';
import { playLine } from './board';
import { learnGame, learnGames } from './fixtures';
import samples from './fixtures/why-wrong-turns.json';
import { whyWrong } from './whyWrong';

const caroKann = learnGame('caro-kann-1100-0025');

type SampleKey = keyof typeof samples;

/** A real turn from the critic's samples, keyed "game-id#turn-index", with the moves before it; only what whyWrong reads is kept. */
function sample(key: SampleKey): Game {
  const { side, start, moves, turn } = samples[key] as unknown as { side: Side; start: string[]; moves: string[]; turn: Turn };
  return { id: key, opening: 'italian', level: 1400, side, start, moves, turns: [turn] };
}

/** What the coach says about `uci` at the sample's turn, from no hint to the hint that marks the piece in trouble. */
function told(key: SampleKey, uci: string) {
  const game = sample(key);
  return { early: whyWrong(game, 0, uci, 0), named: whyWrong(game, 0, uci, 2) };
}

describe('a move that loses material', () => {
  it('names the reply and the piece it wins, where it is taken', () => {
    expect(whyWrong(caroKann, 8, 'f6g4', 0)).toEqual({
      kind: 'blunder',
      text: 'After Ng4, Qxg4 wins your knight on g4.',
      reply: 'f3g4',
      targets: ['g4'],
      pattern: 'free-piece',
    });
    expect(whyWrong(caroKann, 28, 'g8g7', 0).text).toBe(
      'After Kg7, Bd4+ opens the line from the queen on e4 to your rook on e2, and after Kg8, Qxe2 wins the rook.',
    );
    expect(whyWrong(caroKann, 6, 'e8d7', 0)).toMatchObject({
      kind: 'blunder',
      text: 'After Kd7, Nxf7 takes your pawn on f7 and attacks your queen on d8 and your rook on h8 at once, and after Qf8, Nxh8 wins the rook.',
      reply: 'g5f7',
      targets: ['d8', 'h8'],
    });
  });

  it('says what comes back, from the move itself or a recapture', () => {
    expect(whyWrong(italian1, 1, 'c4f7', 0).text).toBe('After Bxf7+, Kxf7 takes your bishop on f7, and you get only a pawn for it.');
    expect(told('italian-1700-0086#8', 'c2e4').early.text).toBe('After Qxe4, Bxe4 takes your queen on e4, and you get only a knight for it.');
  });
});

describe('the cost counts only the move, the punishing reply and the exchange it starts (R1)', () => {
  it('leaves out the grabs and desperado moves later in the line', () => {
    expect(told('italian-1100-0140#7', 'd5f7').early.text).toBe('After Bf7+, Kxf7 wins your bishop on f7.');
    expect(told('caro-kann-1700-0016#10', 'f5d3').early.text).toBe('After Bd3, Bxd3 wins your bishop on d3.');
    expect(told('caro-kann-1400-0028#15', 'd7d5').early.text).toBe('After Qd5, Qxd5 wins your queen on d5.');
  });

  it('counts a later capture of the piece the move put en prise', () => {
    expect(told('caro-kann-1700-0043#7', 'g7g5').named.text).toBe(
      "That doesn't stop White's threat: Nxd5 wins your pawn on d5, and Bxg5 then takes your pawn on g5.",
    );
  });
});

describe('a capture that is taken back (R2)', () => {
  it('takes the piece, and says what the user gets for it', () => {
    expect(told('italian-1400-0245#10', 'a2a3').named.text).toBe(
      "That doesn't stop Black's threat: Bxf3 takes your queen on f3, and you get only a bishop for it.",
    );
    expect(told('caro-kann-1700-0180#28', 'b2c3').named.text).toBe(
      "That doesn't stop White's threat: Nxf8 takes your rook on f8, and you lose the exchange.",
    );
    expect(told('italian-2000-0231#25', 'e1e4').early.text).toBe(
      'Rxe4 grabs the knight, but Qxe4 takes your rook on e4, and you lose the exchange.',
    );
  });
});

describe('the real payoff of a line (R3)', () => {
  it('names a promotion and an attack on the king that goes on', () => {
    expect(told('caro-kann-1100-0007#13', 'g7g5').named.text).toBe(
      "That doesn't stop White's threat: bxa8=Q+ wins your rook on a8 and makes a new queen, and the attack on your king goes on.",
    );
    expect(told('caro-kann-2000-0150#25', 'g7g6').early.text).toBe(
      'After g6 Qg5 Kg7, Qxh6+ wins your pawn on h6, and the attack on your king goes on.',
    );
  });

  it('names the pieces a capture then attacks, and the bigger piece a later capture takes', () => {
    expect(told('caro-kann-1700-0024#3', 'e8d7').named).toMatchObject({
      text: "That doesn't stop White's threat: Nxf7 wins your pawn on f7 and then attacks your queen on d8 and your rook on h8 at once.",
      targets: ['f7', 'd8', 'h8'],
    });
    expect(told('caro-kann-2000-0010#24', 'b2b3').named.text).toBe(
      "That doesn't stop White's threat: Rxe8+ wins your rook on e8, and axb3 then takes your queen on b3, and the attack on your king goes on.",
    );
  });

  it('plays a line that stops mid-exchange to its end', () => {
    expect(told('italian-1400-0068#25', 'a1a6').named.text).toBe(
      "That doesn't stop Black's threat: Rxf2+ checks your king and attacks your queen on e2 at once, and after Qxf2, Rxf2+ takes your queen on f2, and you get only a rook for your queen and a pawn.",
    );
  });
});

describe('the squares and moves of a line (R4)', () => {
  it('spells a short line out and names the square, never "the line that follows"', () => {
    expect(told('italian-1400-0245#13', 'd2e4').early.text).toBe(
      'Ne4 moves the knight that was guarding your knight on c4, and after Bxc1 Rfxc1, Bxc4 wins it.',
    );
    expect(told('caro-kann-2000-0187#26', 'a5a3').early.text).toBe('After Qa3 Nxe4 dxe4, Qxe4 wins your pawn on e4.');
  });
});

describe('a pattern with what it costs (R5)', () => {
  it('ends a pin, a discovered attack or a removed defender on the material', () => {
    expect(told('caro-kann-2000-0132#15', 'h8g8').early.text).toBe(
      "Rg8 looks natural, but Rxg8+ wins your rook on g8, because your knight on f6 is pinned to your king and can't take back, and Rxc8 then takes your rook on c8.",
    );
    expect(told('caro-kann-1700-0235#8', 'f8d6').early.text).toBe(
      'Bd6 looks natural, but dxc5 wins your pawn on c5 and opens the line from the queen on d1 to your bishop on d6.',
    );
    expect(told('italian-1400-0135#14', 'b2b4').named.text).toBe(
      "That doesn't stop Black's threat: Bxd4 trades off your knight on d4, which guards your bishop on e6, and after Qxd4, Qxe6 wins the bishop.",
    );
  });
});

describe('a threat or a loose piece that was there before the move (R6)', () => {
  it('only says the threat stands until the piece in trouble is marked, and shows nothing on the board', () => {
    const { early, named } = told('caro-kann-1400-0003#11', 'e8g8');
    expect(early).toEqual({ kind: 'ignores-threat', text: "That doesn't stop White's threat.", reply: null, targets: [], pattern: 'fork' });
    expect(whyWrong(sample('caro-kann-1400-0003#11'), 0, 'e8g8', 1).text).toBe(early.text);
    expect(named).toMatchObject({
      text: "That doesn't stop White's threat: b4 attacks your queen on a5 and your bishop on c5 at once, and after Bxb4, axb4 takes your bishop on b4, and you get only two pawns for it.",
      reply: 'b2b4',
    });
  });

  it('names the threat and plays it once the piece in trouble is marked', () => {
    expect(whyWrong(caroKann, 8, 'd7c5', 0)).toMatchObject({ kind: 'ignores-threat', text: "That doesn't stop White's threat.", reply: null });
    expect(whyWrong(caroKann, 8, 'd7c5', 2)).toMatchObject({
      text: "That doesn't stop White's threat: Nxf6+ trades off your knight on f6, which guards your pawn on h7, and after gxf6, Bxh7+ wins the pawn, and the attack on your king goes on.",
      reply: caroKann.turns[8].refutations.d7c5[0],
    });
    expect(whyWrong(caroKann, 15, 'a8d8', 2).text).toBe("That doesn't stop White's threat: Qh7 is checkmate.");
    expect(whyWrong(caroKann, 15, 'f8d8', 0).text).toBe("There's a better answer to White's threat.");
  });

  it('holds back the blunders and baits that carry out the threat', () => {
    expect(told('italian-1400-0161#10', 'b2b4').early.text).toBe("That doesn't stop Black's threat.");
    expect(told('italian-1400-0161#10', 'b2b4').named.text).toBe("That doesn't stop Black's threat: Nxc4 wins your bishop on c4.");
    expect(told('italian-1400-0004#14', 'd2e2').named.text).toBe(
      "That doesn't stop Black's threat: after Nf4 Qe1, Qxh4 wins your knight on h4.",
    );
    expect(told('italian-2000-0077#2', 'e5f6').early.text).toBe("exf6 grabs the knight, but it doesn't stop Black's threat.");
    expect(told('italian-2000-0077#2', 'e5f6').named.text).toBe(
      "exf6 grabs the knight, but it doesn't stop Black's threat: dxc4 takes your bishop on c4 in return, and Qxf6 then takes your pawn on f6.",
    );
  });

  it('says a piece already hung only as hanging, until it is marked', () => {
    const { early, named } = told('caro-kann-1100-0034#7', 'c5d7');
    expect(early).toMatchObject({ kind: 'bait', text: 'Ncd7 looks natural, but it leaves a piece hanging.', reply: null, targets: [] });
    expect(named).toMatchObject({ text: 'Ncd7 looks natural, but it leaves a piece hanging: Qxa8 wins your rook on a8.', reply: 'c6a8' });
  });
});

describe('a move that leaves material down (R7)', () => {
  it('says the user stays down what was just taken, and from hint 2 how the piece gets away', () => {
    expect(told('italian-2000-0176#11', 'b3d5').early).toEqual({ kind: 'missed', text: 'After Bd5, you stay a queen down.', reply: null, targets: [] });
    expect(told('italian-2000-0176#11', 'b3d5').named.text).toBe("After Bd5, you stay a queen down: Black's queen gets away with Qd3.");
    expect(told('italian-1400-0116#14', 'b2b3').named.text).toBe(
      "After b3, you stay a queen down: Black's queen gets away with Qxe1+, taking your rook on e1.",
    );
  });
});

describe('a move no line punishes (R8)', () => {
  it('never calls it safe', () => {
    expect(whyWrong(italian1, 1, 'd4d5', 0)).toEqual({ kind: 'weaker', text: "There's a stronger move here.", reply: null, targets: [] });
    expect(told('caro-kann-1400-0029#17', 'e6e5').early.text).toBe("There's a stronger move here.");
  });

  it('names a piece the move leaves hanging, held back when it hung before', () => {
    expect(told('italian-1100-0169#6', 'h1h2').early).toEqual({ kind: 'ignores-threat', text: "That doesn't stop Black's threat.", reply: null, targets: [] });
    expect(told('italian-1100-0169#6', 'h1h2').named.text).toBe("That doesn't stop Black's threat: fxg5 wins your knight on g5.");
  });

  it("doesn't claim a capture that loses for the opponent or is paid back", () => {
    expect(told('caro-kann-1700-0127#18', 'f6d7').early.text).toBe("There's a stronger move here.");
    expect(told('italian-1100-0094#24', 'f1h1').early.text).toBe("There's a stronger move here.");
    expect(told('italian-2000-0110#9', 'f3d2').early.text).toBe('Nd2 lets the chance go.');
  });

  it('says when the user ends up worse', () => {
    expect(told('caro-kann-1400-0204#12', 'c6d8').early.text).toBe('Nd8 lets the chance go, and you end up worse.');
    expect(told('italian-2000-0234#20', 'f2f3').early.text).toBe("There's a much stronger move here, and after f3 you end up worse.");
  });
});

describe('phrasing (R9)', () => {
  it('names a trade instead of repeating a move, and finishes a mate threat', () => {
    expect(told('caro-kann-1700-0145#27', 'c7c3').early.text).toBe('Qxc3 grabs a pawn, but once the queens come off, Rxe7 wins your knight on e7.');
    expect(told('italian-2000-0112#1', 'f3e5').early.text).toBe(
      'Nxe5 grabs a pawn, but the knight on c6 takes back and wins your knight on e5.',
    );
    expect(told('caro-kann-2000-0148#26', 'e5c7').early.text).toBe(
      'After Bc7, Qg4 threatens mate on g7, and stopping it costs you your rook.',
    );
  });
});

describe('material the line only wins after a poor move of the user (R11)', () => {
  it('is not claimed', () => {
    expect(told('caro-kann-1100-0217#14', 'd8d7').named.text).toBe(
      "That doesn't stop White's threat: Nd6+ checks your king and attacks your bishop on f5 at once.",
    );
    expect(told('caro-kann-2000-0193#13', 'g6f4').early.text).toBe('Nf4 lets the chance go, and you end up worse.');
    expect(told('italian-1700-0073#9', 'd1b3').early.text).toBe('Qb3 lets the chance go.');
    expect(told('italian-1700-0058#15', 'g2g4').named.text).toBe(
      "That doesn't stop Black's threat: after Ne2+ Kf2, Nxf4 wins your pawn on f4.",
    );
  });
});

describe('the common mistake', () => {
  it('is told the way the lesson opens the trap', () => {
    expect(whyWrong(italian1, 3, 'c4f7', 0)).toMatchObject({
      kind: 'bait',
      text: 'Bxf7+ grabs a pawn, but Kxf7 wins your bishop on f7.',
      reply: 'e8f7',
      targets: ['f7'],
    });
    expect(whyWrong(caroKann, 6, 'f6d5', 0)).toMatchObject({
      kind: 'bait',
      text: 'Nd5 looks natural, but Nxf7 takes your pawn on f7 and attacks your queen on d8 and your rook on h8 at once, and after Nxf4, Nxd8 takes the queen, and you get only a bishop for your queen and a pawn.',
      targets: ['d8', 'h8'],
    });
  });
});

describe('the plain answer', () => {
  it('is all a move without a grade gets', () => {
    expect(whyWrong(italian1, 1, 'a2a3', 0)).toEqual({ kind: 'unknown', text: 'Not quite. Try again.', reply: null, targets: [] });
  });

  it('is all there is once the move is drawn on the board', () => {
    expect(whyWrong(italian1, 1, 'c4f7', 3)).toEqual({ kind: 'blunder', text: 'Not quite. Try again.', reply: null, targets: [] });
  });
});

describe('every graded move of the fixture games', () => {
  const games: Game[] = [...learnGames, italian1];

  it('never names the best move or the game move, never says safe, and only plays a legal reply', () => {
    for (const game of games) {
      game.turns.forEach((turn, i) => {
        if (turn.label !== 'critical') return;
        const answers = [playLine(turn.fen, turn.lines.best ?? [])[0]?.san, game.moves[turn.ply]];
        for (const uci of Object.keys(turn.grades)) {
          const [move] = playLine(turn.fen, [uci]);
          if (answers.includes(move?.san)) continue;
          for (const hint of [0, 2] as const) {
            const why = whyWrong(game, i, uci, hint);
            for (const san of answers) expect(why.text.split(/[\s,.:]+/), `${game.id} ${i} ${uci}`).not.toContain(san);
            expect(why.text).not.toMatch(/\bsafe\b|line that follows/);
            if (why.reply) expect(playLine(move.after, [why.reply])).toHaveLength(1);
          }
        }
      });
    }
  }, 60_000);
});
