import { describe, expect, it } from 'vitest';
import type { Game, Side, Turn } from '../content/types';
import { italian1 } from '../pause/testGames';
import { playLine } from './board';
import { learnGame, learnGames } from './fixtures';
import samples from './fixtures/why-wrong-turns.json';
import { nothingHangs } from './loss';
import { whyWrong } from './whyWrong';

const caroKann = learnGame('caro-kann-1100-0025');

type SampleKey = keyof typeof samples;

/** A real turn from the critic's samples, keyed "game-id#turn-index", with the moves before it; only what whyWrong reads is kept. */
function sample(key: SampleKey): Game {
  const { side, start, moves, turn } = samples[key] as unknown as { side: Side; start: string[]; moves: string[]; turn: Turn };
  return { id: key, opening: 'italian', level: 1400, side, start, moves, turns: [turn] };
}

/** What the coach says about `uci` at the sample's turn: with no hint, once the pattern is named, and once the piece is marked. */
function told(key: SampleKey, uci: string) {
  const game = sample(key);
  return { early: whyWrong(game, 0, uci, 0), pattern: whyWrong(game, 0, uci, 1), named: whyWrong(game, 0, uci, 2) };
}

const sentences = (text: string) => text.split(/(?<=[.?])\s+(?=[A-Z])/);
const words = (sentence: string) => sentence.split(/\s+/).length;

describe('a move that loses material', () => {
  it('names the reply in words and the piece it takes, and says the loss last', () => {
    expect(whyWrong(caroKann, 8, 'f6g4', 0)).toEqual({
      kind: 'blunder',
      text: "White's queen takes your knight for free.",
      reply: 'f3g4',
      targets: ['g4'],
      pattern: 'free-piece',
    });
    expect(whyWrong(caroKann, 28, 'g8g7', 0).text).toBe(
      "White's bishop moves to d4 with check, and now White's queen attacks your rook on e2. You lose a rook.",
    );
    expect(whyWrong(caroKann, 6, 'e8d7', 0)).toMatchObject({
      kind: 'blunder',
      text: "White's knight takes your pawn on f7 and attacks your queen and rook on h8 at once. You lose a rook and a pawn.",
      reply: 'g5f7',
      targets: ['d8', 'h8'],
    });
  });

  it('says what comes back, from the move itself or a recapture', () => {
    expect(whyWrong(italian1, 1, 'c4f7', 0).text).toBe("Black's king takes your bishop. You lose a bishop and only get a pawn back.");
    expect(told('italian-1700-0086#8', 'c2e4').early.text).toBe("Black's bishop takes your queen. You lose your queen and only get a knight back.");
  });
});

describe('words a beginner can follow', () => {
  it('names at most the reply and the move that matters, and tells a long way there in a few words', () => {
    // Once the #1 complaint: "After Rg8 Bxc6 Bxc6 a3 Bxc5, b4 attacks your queen on a5 and your bishop on c5 at once, ..."
    expect(told('caro-kann-1400-0128#10', 'h8g8').early.text).toBe(
      "A few moves later, White's pawn moves to b4 and attacks your queen and bishop on c5 at once. In the end, you lose your queen for a bishop, a knight and a pawn.",
    );
    // Once "Re1 moves your rook out of danger, but after Qb6+ d4, Bd5 traps your queen on f7, and after c3, Bxf7 takes the queen, ..."
    expect(told('italian-1700-0069#9', 'f1e1').early.text).toBe(
      "After a check, Black's bishop moves to d5, and your queen can't escape. You lose your queen and only get a bishop back.",
    );
    expect(told('italian-1700-0120#19', 'g4g7').early.text).toBe(
      "Black takes back on g7, and a few moves later Black's rook takes your knight. In the end, you lose a knight and only get a pawn back.",
    );
    expect(told('caro-kann-1700-0213#25', 'b8b6').early.text).toBe(
      "White's knight moves to e5, and then it moves to d7 and lures your queen away from your rook. You lose a rook and only get a knight back.",
    );
  });

  it('tells the reply on the board alone when the middle of the line hides captures of the user', () => {
    expect(told('caro-kann-1400-0096#17', 'c8b8').early).toMatchObject({
      text: "That doesn't stop White's threat: White's bishop moves to f4 and attacks your queen. In the end, you lose a rook and only get a pawn back.",
      reply: 'e3f4',
    });
  });

  it('says castling in words', () => {
    expect(told('italian-1400-0169#9', 'e1g1').early.text).toBe(
      "Castling looks natural, but it allows checkmate: Black's queen takes your pawn on h2.",
    );
    expect(told('italian-1700-0083#5', 'e1g1').named.text).toBe(
      "One of your pieces is still in danger: Black's queen takes your knight on e5 for free.",
    );
  });

  it('says a rook for a minor piece plainly, and "only" only of what comes back', () => {
    expect(told('caro-kann-1700-0180#28', 'b2c3').early.text).toBe(
      "That doesn't stop White's threat: White's knight takes your rook. You lose a rook and only get a knight back.",
    );
    expect(told('caro-kann-2000-0206#25', 'g7g6').early.text).toBe(
      "After the queens are traded, White's knight takes your pawn on f6, checks your king and attacks your rook at once. You lose a rook and a pawn for a knight.",
    );
  });

  it('stays within two short sentences for every graded move of the fixture games', () => {
    const games: Game[] = [...learnGames, italian1, ...Object.keys(samples).map((key) => sample(key as SampleKey))];
    for (const game of games) {
      game.turns.forEach((turn, i) => {
        if (turn.label !== 'critical') return;
        for (const uci of Object.keys(turn.grades)) {
          for (const hint of [0, 1, 2] as const) {
            const { text } = whyWrong(game, i, uci, hint);
            const where = `${game.id} ${i} ${uci}: ${text}`;
            expect(sentences(text).length, where).toBeLessThanOrEqual(2);
            for (const sentence of sentences(text)) expect(words(sentence), where).toBeLessThanOrEqual(24);
            expect(text, where).not.toMatch(/\b[KQRBN][a-h1-8]?x?[a-h][1-8]|\b[a-h]x[a-h][1-8]|O-O|the exchange|chance go|end up worse|goes on|stronger move here|only (?:a|two)\b/);
          }
        }
      });
    }
  }, 60_000);
});

describe('the cost counts only the move, the punishing reply and the exchange it starts (R1)', () => {
  it('leaves out the grabs and desperado moves later in the line', () => {
    expect(told('italian-1100-0140#7', 'd5f7').early.text).toBe("Black's king takes your bishop for free.");
    expect(told('caro-kann-1700-0016#10', 'f5d3').early.text).toBe("White's bishop takes your bishop for free.");
    expect(told('caro-kann-1400-0028#15', 'd7d5').early.text).toBe("White's queen takes your queen for free.");
  });

  it('counts a later capture of the piece the move put en prise', () => {
    expect(told('caro-kann-1700-0043#7', 'g7g5').early.text).toBe(
      "That doesn't stop White's threat: White's knight takes your pawn on d5, and later White takes your pawn on g5. You lose two pawns.",
    );
  });
});

describe('a capture that is taken back (R2)', () => {
  it('takes the piece, and says what the user gets for it', () => {
    expect(told('italian-1400-0245#10', 'a2a3').early.text).toBe(
      "That doesn't stop Black's threat: Black's bishop takes your queen. You lose your queen and only get a bishop back.",
    );
    expect(told('italian-2000-0231#25', 'e1e4').early.text).toBe(
      "Taking the knight on e4 looks free, but Black's queen takes your rook. You lose a rook and only get a knight back.",
    );
  });

  it('gives the loss as the end result when the pieces the text names come back', () => {
    expect(told('italian-2000-0077#2', 'e5f6').early.text).toBe(
      "Taking the knight on f6 doesn't stop Black's threat: Black's pawn takes your bishop on c4 in return. In the end, you lose a pawn.",
    );
  });
});

describe('the real payoff of a line (R3)', () => {
  it('names a promotion and an attack on the king that goes on', () => {
    expect(told('caro-kann-1100-0007#13', 'g7g5').early.text).toBe(
      "That doesn't stop White's threat: White's pawn takes your rook on a8 with check and becomes a queen. You lose a rook, White gets a new queen, and White keeps checking your king.",
    );
    expect(told('caro-kann-2000-0150#25', 'g7g6').early.text).toBe(
      "White's queen moves to g5, and then it takes your pawn on h6 with check. You lose a pawn, and White keeps checking your king.",
    );
  });

  it('names the pieces a capture then attacks, and the bigger piece a later capture takes', () => {
    expect(told('caro-kann-1700-0024#3', 'e8d7').early).toMatchObject({
      text: "That doesn't stop White's threat: White's knight takes your pawn on f7 and then attacks your queen and rook on h8. You lose a pawn.",
      targets: ['f7', 'd8', 'h8'],
    });
    expect(told('caro-kann-2000-0010#24', 'b2b3').early.text).toBe(
      "That doesn't stop White's threat: White's rook takes your rook with check, and later White takes your queen on b3. You lose your queen and a rook, and White keeps checking your king.",
    );
  });

  it('plays a line that stops mid-exchange to its end', () => {
    expect(told('italian-1400-0068#25', 'a1a6').early.text).toBe(
      "That doesn't stop Black's threat: Black's rook takes your pawn on f2, checks your king and attacks your queen at once. You lose your queen and a pawn for a rook.",
    );
  });
});

describe('the squares and moves of a line (R4)', () => {
  it('says what the moves before the capture do, never spelling them out', () => {
    expect(told('italian-1400-0245#13', 'd2e4').early.text).toBe(
      "The knight you moved was guarding your knight on c4, and after a trade on c1, Black's bishop takes it for free.",
    );
    expect(told('caro-kann-2000-0187#26', 'a5a3').early.text).toBe("After a trade on e4, White's queen takes your pawn on e4 for free.");
  });
});

describe('a pattern with what it costs (R5)', () => {
  it('ends a pin, a discovered attack or a removed defender on the material', () => {
    expect(told('caro-kann-2000-0132#15', 'h8g8').early.text).toBe(
      "White's rook takes your rook with check, and your pinned knight can't take back, and later White takes your rook on c8. You lose two rooks.",
    );
    expect(told('caro-kann-1700-0235#8', 'f8d6').early.text).toBe(
      "White's pawn takes your pawn on c5, and now White's queen attacks your bishop on d6. You lose a pawn.",
    );
    expect(told('italian-1400-0135#14', 'b2b4').early.text).toBe(
      "That doesn't stop Black's threat: Black's bishop takes your knight, and your bishop on e6 is left unguarded. In the end, you lose a bishop.",
    );
  });
});

describe('a threat that was there before the move (R6)', () => {
  it('is shown at once: the user has moved, and what the threat does gives away nothing about stopping it', () => {
    const { early, pattern, named } = told('caro-kann-1400-0003#11', 'e8g8');
    expect(early).toEqual({
      kind: 'ignores-threat',
      text: "That doesn't stop White's threat: White's pawn moves to b4 and attacks your queen and bishop on c5 at once. You lose a bishop for two pawns.",
      reply: 'b2b4',
      targets: ['a5', 'c5'],
      pattern: 'fork',
    });
    expect(pattern).toEqual(early);
    expect(named).toEqual(early);
    expect(whyWrong(caroKann, 8, 'd7c5', 0)).toMatchObject({
      kind: 'ignores-threat',
      text: "That doesn't stop White's threat: White's knight takes your knight on f6 with check, and your pawn on h7 is left unguarded. In the end, you lose a pawn, and White keeps attacking your king.",
      reply: caroKann.turns[8].refutations.d7c5[0],
    });
    expect(whyWrong(caroKann, 15, 'a8d8', 0).text).toBe("That doesn't stop White's threat: White's queen moves to h7, and that's checkmate.");
  });

  it('shows the threat the blunders and baits carry out', () => {
    expect(told('italian-1400-0161#10', 'b2b4').early).toMatchObject({
      text: "That doesn't stop Black's threat: Black's knight takes your bishop on c4 for free.",
      reply: 'e5c4',
    });
    expect(told('italian-1400-0004#14', 'd2e2').early.text).toBe(
      "That doesn't stop Black's threat: Black's knight moves to f4, and then Black's queen takes your knight on h4 for free.",
    );
    expect(told('caro-kann-1100-0217#14', 'd8d7').early).toMatchObject({
      kind: 'ignores-threat',
      text: "That doesn't stop White's threat: White's knight moves to d6, gives check and attacks your bishop.",
      reply: 'b5d6',
    });
    expect(told('italian-1100-0169#6', 'h1h2').early).toEqual({
      kind: 'ignores-threat',
      text: "That doesn't stop Black's threat: Black's pawn takes your knight.",
      reply: 'f6g5',
      targets: ['g5'],
    });
  });

  it('holds back a piece that already hung until it is marked, since naming it would point at the answer', () => {
    const { early, pattern, named } = told('caro-kann-1100-0034#7', 'c5d7');
    expect(early).toMatchObject({ kind: 'bait', text: 'One of your pieces is still in danger. Which one can White take?', reply: null, targets: [] });
    expect(pattern.text).toBe(early.text);
    expect(named).toMatchObject({ text: "One of your pieces is still in danger: White's queen takes your rook on a8 for free.", reply: 'c6a8' });
  });
});

describe('a move that leaves material down (R7)', () => {
  it('says the user stays down what was just taken, and from hint 2 how the piece gets away', () => {
    expect(told('italian-2000-0176#11', 'b3d5').early).toEqual({
      kind: 'missed',
      text: 'After that move, you are still a queen down.',
      reply: null,
      targets: [],
    });
    expect(told('italian-2000-0176#11', 'b3d5').named.text).toBe("After that move, you are still a queen down: Black's queen gets away to d3.");
    expect(told('italian-1400-0116#14', 'b2b3').named.text).toBe(
      "After that move, you are still a queen down: Black's queen gets away by taking your rook on e1.",
    );
  });
});

describe('a move no line punishes (R8)', () => {
  it('says what the move takes where the user is looking to win, and where to look', () => {
    expect(whyWrong(italian1, 1, 'd4d5', 0)).toEqual({
      kind: 'weaker',
      text: "That's safe, but it doesn't win material right away. Look for an enemy piece that isn't protected enough.",
      reply: null,
      targets: [],
    });
    expect(told('caro-kann-1100-0001#5', 'f8c5').early.text).toBe(
      "That's safe, but it doesn't win material right away. Look for an enemy piece that isn't protected enough.",
    );
  });

  it('points at the pattern once the hint has named it', () => {
    expect(told('caro-kann-1100-0001#5', 'f8c5').pattern.text).toBe(
      "That's safe, but it doesn't win material right away. Look for a big piece you can attack with another piece behind it.",
    );
    expect(told('italian-1100-0094#24', 'f1h1').pattern.text).toBe(
      "That doesn't win material right away. Look for a piece you can move out of the way of another.",
    );
  });

  it('calls a move safe only when nothing of the user hangs after it', () => {
    const [unsafe] = playLine(sample('italian-1100-0094#24').turns[0].fen, ['f1h1']);
    expect(nothingHangs(unsafe)).toBe(false);
    expect(told('italian-1100-0094#24', 'f1h1').early.text).toBe("That doesn't win material right away. Look for an enemy piece that isn't protected enough.");
    expect(told('caro-kann-1700-0127#18', 'f6d7').early.text).toBe("That doesn't win material right away. Look for an enemy piece that isn't protected enough.");
  });

  it('says how the position stands after a missed win, from the grades', () => {
    expect(told('caro-kann-1400-0204#12', 'c6d8').early.text).toBe(
      "That misses a chance to win material: after it, you are worse. Look for an enemy piece that isn't protected enough.",
    );
    expect(told('italian-1700-0073#9', 'd1b3').early.text).toBe(
      "That misses a chance to win material: after it, the position is about even. Look for an enemy piece that isn't protected enough.",
    );
    expect(told('italian-2000-0110#9', 'f3d2').early.text).toBe(
      "Another move wins more: after yours, the position is about even. Look for an enemy piece that isn't protected enough.",
    );
    expect(told('italian-2000-0058#21', 'g1h2').early.text).toBe(
      'That misses a strong attack on the king: after it, you are still better, but by less. Look at every check and threat you have.',
    );
  });

  it('tells a defence that stops the threat from one that leaves it standing, and shows the threat', () => {
    expect(told('caro-kann-1400-0229#19', 'c4a5').early.text).toBe(
      "That stops White's threat, but there is a better way to do it. Look at every way to defend.",
    );
    expect(whyWrong(caroKann, 15, 'f8d8', 0).text).toBe(
      "That stops White's threat, but after it the position is about even. Look at every way to defend.",
    );
    expect(told('italian-1100-0177#6', 'a1c1').early).toMatchObject({
      kind: 'missed',
      text: "That doesn't stop Black's threat: Black's pawn moves to a6 and attacks your bishop on b5. After your move, you are still better, but by less.",
      reply: 'a7a6',
    });
  });

  it('sends the user looking for the trap without naming it', () => {
    expect(told('caro-kann-1100-0088#3', 'c8d7').early.text).toBe(
      'That avoids the trap, but there is a better move. Think about what your opponent can do after each natural move.',
    );
    expect(told('italian-2000-0234#20', 'f2f3').early.text).toBe(
      'That avoids the trap, but after it you are worse. Think about what your opponent can do after each natural move.',
    );
  });

  it("doesn't claim a capture that loses for the opponent or is paid back", () => {
    expect(told('caro-kann-1400-0029#17', 'e6e5').early.reply).toBeNull();
    expect(told('caro-kann-1700-0127#18', 'f6d7').early.reply).toBeNull();
    expect(told('italian-2000-0110#9', 'f3d2').early.reply).toBeNull();
  });
});

describe('phrasing (R9)', () => {
  it('names a trade instead of telling its moves, and finishes a mate threat', () => {
    expect(told('caro-kann-1700-0145#27', 'c7c3').early.text).toBe(
      "After the queens are traded, White's rook takes your knight. You lose a knight and only get a pawn back.",
    );
    expect(told('italian-2000-0112#1', 'f3e5').early.text).toBe(
      "You take the pawn on e5, but Black's knight takes your knight. You lose a knight and only get a pawn back.",
    );
    expect(told('caro-kann-2000-0148#26', 'e5c7').early.text).toBe(
      "White's queen moves to g4 and threatens checkmate on g7. Stopping it costs you a rook.",
    );
  });
});

describe('material the line only wins after a poor move of the user (R11)', () => {
  it('is not claimed', () => {
    expect(told('caro-kann-1100-0217#14', 'd8d7').early.text).toBe(
      "That doesn't stop White's threat: White's knight moves to d6, gives check and attacks your bishop.",
    );
    expect(told('caro-kann-2000-0193#13', 'g6f4').early.text).toBe(
      "That misses a chance to win material: after it, you are worse. Look for an enemy piece that isn't protected enough.",
    );
    expect(told('italian-1700-0073#9', 'd1b3').early.reply).toBeNull();
    expect(told('italian-1700-0058#15', 'g2g4').early.text).toBe(
      "That doesn't stop Black's threat: after a check, Black's knight takes your pawn on f4 for free.",
    );
  });

  it('still blames the move when the piece falls without that poor move too', () => {
    // Taking back at once with dxe4 drops the bishop on c4 as well, so Qb7 isn't what loses it.
    expect(told('caro-kann-1400-0128#15', 'f6e4').early.text).toBe(
      "White's knight takes your knight, and a few moves later White's queen takes your bishop on c4. In the end, you lose a bishop.",
    );
  });
});

describe('the common mistake', () => {
  it('is told the way the lesson opens the trap', () => {
    expect(whyWrong(italian1, 3, 'c4f7', 0)).toMatchObject({
      kind: 'bait',
      text: "You take the pawn on f7, but Black's king takes your bishop. You lose a bishop and only get a pawn back.",
      reply: 'e8f7',
      targets: ['f7'],
    });
    expect(whyWrong(caroKann, 6, 'f6d5', 0)).toMatchObject({
      kind: 'bait',
      text: "White's knight takes your pawn on f7 and attacks your queen and rook on h8 at once. You lose your queen and a pawn for a bishop.",
      targets: ['d8', 'h8'],
    });
    expect(told('italian-2000-0231#25', 'e1e4').early.kind).toBe('bait');
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

  it('never names the best move or the game move, says safe only when nothing hangs, and only plays a legal reply', () => {
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
            if (/That's safe/.test(why.text)) expect(nothingHangs(move), `${game.id} ${i} ${uci}: ${why.text}`).toBe(true);
            expect(why.text).not.toMatch(/line that follows/);
            if (why.reply) expect(playLine(move.after, [why.reply])).toHaveLength(1);
          }
        }
      });
    }
  }, 60_000);
});
