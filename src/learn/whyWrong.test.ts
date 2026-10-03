import { describe, expect, it } from 'vitest';
import type { Game } from '../content/types';
import { italian1 } from '../pause/testGames';
import { playLine } from './board';
import { learnGame, learnGames } from './fixtures';
import { whyWrong } from './whyWrong';

const caroKann = learnGame('caro-kann-1100-0025');

describe('a move that loses material', () => {
  it('names the reply, the pattern and the piece it wins, counted over the whole line', () => {
    expect(whyWrong(italian1, 1, 'c4f7', 0)).toEqual({
      kind: 'blunder',
      text: 'After Bxf7+, Black plays Kxf7, which wins your bishop for two pawns.',
      reply: 'e8f7',
      targets: ['f7'],
      pattern: 'free-piece',
    });
    expect(whyWrong(caroKann, 6, 'e8d7', 0)).toMatchObject({
      kind: 'blunder',
      text: 'After Kd7, White plays Nxf7, a fork that wins your rook and a pawn.',
      reply: 'g5f7',
      targets: ['d8', 'h8'],
    });
    expect(whyWrong(caroKann, 28, 'g8g7', 0).text).toBe('After Kg7, White plays Bd4+, a discovered attack that wins your rook.');
  });

  it('says a piece left loose is taken for free', () => {
    expect(whyWrong(caroKann, 8, 'f6g4', 0)).toMatchObject({
      kind: 'blunder',
      text: 'After Ng4, White plays Qxg4, taking your knight on g4 for free.',
      reply: 'f3g4',
      targets: ['g4'],
    });
  });
});

describe('the common mistake', () => {
  it('is told the way the lesson tells the trap', () => {
    expect(whyWrong(italian1, 3, 'c4f7', 0)).toMatchObject({
      kind: 'bait',
      text: 'Bxf7+ grabs a pawn, but Kxf7 wins your bishop on f7.',
      reply: 'e8f7',
      targets: ['f7'],
    });
    expect(whyWrong(caroKann, 6, 'f6d5', 0)).toMatchObject({
      kind: 'bait',
      text: 'Nd5 looks natural, but Nxf7 attacks your queen on d8 and your rook on h8 at once.',
      targets: ['d8', 'h8'],
    });
  });
});

describe('a move that leaves the threat standing', () => {
  it('only says so until a hint has pointed at the threat, and shows nothing on the board', () => {
    expect(whyWrong(caroKann, 8, 'd7c5', 0)).toMatchObject({
      kind: 'ignores-threat',
      text: "That doesn't stop White's threat.",
      reply: null,
      targets: [],
    });
    expect(whyWrong(caroKann, 8, 'd7c5', 1).text).toBe("That doesn't stop White's threat.");
  });

  it('names the threat and plays it once the piece in trouble is marked', () => {
    const named = whyWrong(caroKann, 8, 'd7c5', 2);
    expect(named.text).toBe("That doesn't stop White's threat: Nxf6+ trades off your knight on f6, which guards your pawn on h7.");
    expect(named.reply).toBe(caroKann.turns[8].refutations.d7c5[0]);
    expect(whyWrong(caroKann, 15, 'a8d8', 2).text).toBe("That doesn't stop White's threat: Qh7 is checkmate.");
  });
});

describe('a move that loses nothing', () => {
  it('is safe but weaker when it costs under 10%', () => {
    expect(whyWrong(italian1, 1, 'd4d5', 0)).toEqual({
      kind: 'weaker',
      text: "d5 is safe, but there's a stronger move here.",
      reply: null,
      targets: [],
    });
  });

  it('lets the chance go at a win, and leaves a better answer to the threat at a defence', () => {
    expect(whyWrong(italian1, 3, 'f1e1', 0)).toMatchObject({ kind: 'missed', text: 'Re1 is safe, but it lets the chance go.', reply: null });
    expect(whyWrong(caroKann, 15, 'f8d8', 0).text).toBe("Rfd8 is safe, but there's a better answer to White's threat.");
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

  it('never names the best move or the game move, and only plays a legal reply', () => {
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
            if (why.reply) expect(playLine(move.after, [why.reply])).toHaveLength(1);
          }
        }
      });
    }
  }, 60_000);
});
