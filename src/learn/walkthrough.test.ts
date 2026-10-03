import { Chess, type Color, type Square } from 'chess.js';
import { describe, expect, it } from 'vitest';
import type { Game } from '../content/types';
import { withTurn } from '../game/position';
import { italian1, italian2 } from '../pause/testGames';
import { VALUE, exchangeGain, isLoose, playLine } from './board';
import { learnGame, learnGames, realTurn } from './fixtures';
import turns from './fixtures/turns.json';
import { walkthrough, type Beat, type Claim } from './walkthrough';

type Key = Parameters<typeof realTurn>[0];

const beatsOf = (key: Key) => walkthrough(realTurn(key), 0);
const texts = (beats: Beat[]) => beats.map((b) => b.text);
const other = (color: Color): Color => (color === 'w' ? 'b' : 'w');
const sameSet = (a: Square[], b: Square[]) => [...a].sort().join() === [...b].sort().join();

/** The squares strictly between two squares on one line, or null when they share none. */
function between(a: Square, b: Square): Square[] | null {
  const [af, ar, bf, br] = [a.charCodeAt(0), Number(a[1]), b.charCodeAt(0), Number(b[1])];
  const [df, dr] = [Math.sign(bf - af), Math.sign(br - ar)];
  if (af !== bf && ar !== br && Math.abs(bf - af) !== Math.abs(br - ar)) return null;
  const squares: Square[] = [];
  for (let f = af + df, r = ar + dr; f !== bf || r !== br; f += df, r += dr) squares.push(`${String.fromCharCode(f)}${r}` as Square);
  return squares;
}

function around(square: Square): Square[] {
  const [file, rank] = [square.charCodeAt(0), Number(square[1])];
  return [-1, 0, 1].flatMap((df) =>
    [-1, 0, 1].flatMap((dr) => {
      const [f, r] = [file + df, rank + dr];
      return (df || dr) && f >= 97 && f <= 104 && r >= 1 && r <= 8 ? [`${String.fromCharCode(f)}${r}` as Square] : [];
    }),
  );
}

/** Checks a claim straight on the board, without the walkthrough's own helpers. */
function holds(fen: string, claim: Claim): boolean {
  const board = new Chess(fen);
  const colorOf = (square: Square) => board.get(square)!.color;
  const empty = (squares: Square[] | null) => squares !== null && squares.every((s) => !board.get(s));
  switch (claim.claim) {
    case 'undefended':
      return board.attackers(claim.square, colorOf(claim.square)).length === 0;
    case 'hangs':
      return isLoose(fen, claim.square);
    case 'safe':
      return Boolean(board.get(claim.square)) && !isLoose(fen, claim.square);
    case 'mates': {
      const [move] = playLine(fen, [claim.move]);
      return move !== undefined && new Chess(move.after).isCheckmate();
    }
    case 'attackers':
      return sameSet(board.attackers(claim.square, other(colorOf(claim.square))), claim.squares);
    case 'guards':
      return sameSet(board.attackers(claim.square, colorOf(claim.square)), claim.squares);
    case 'attacks':
      return claim.squares.every((s) => board.attackers(s, colorOf(claim.square)).includes(claim.square));
    case 'escape-squares': {
      const color = colorOf(claim.square);
      const moves = new Chess(withTurn(fen, color)).moves({ square: claim.square, verbose: true });
      const lost = moves.filter((m) => exchangeGain(new Chess(m.after), m.to) > (m.captured ? VALUE[m.captured] : 0));
      return sameSet([...new Set(moves.map((m) => m.to))], claim.squares) && sameSet([...new Set(lost.map((m) => m.to))], claim.covered);
    }
    case 'boxed': {
      const color = colorOf(claim.square);
      const near = around(claim.square);
      const blocked = near.filter((s) => board.get(s)?.color === color);
      const covered = near.filter((s) => !blocked.includes(s) && board.attackers(s, other(color)).length > 0);
      const free = near.filter((s) => !blocked.includes(s) && !covered.includes(s));
      return sameSet(blocked, claim.blocked) && sameSet(covered, claim.covered) && sameSet(free, claim.free);
    }
    case 'in-line':
      return empty(between(...claim.squares));
    case 'blocks': {
      const line = between(claim.from, claim.to);
      return line !== null && line.includes(claim.square) && empty(line.filter((s) => s !== claim.square));
    }
    case 'backs': {
      const line = between(claim.square, claim.target);
      const own = colorOf(claim.square) === colorOf(claim.front);
      return own && line !== null && line.includes(claim.front) && empty(line.filter((s) => s !== claim.front));
    }
    case 'pin': {
      const { pinner, square, behind } = claim;
      const aligned = between(pinner, behind)?.includes(square) ?? false;
      const slides = board.attackers(square, colorOf(pinner)).includes(pinner);
      return aligned && slides && empty(between(square, behind)) && colorOf(behind) === colorOf(square) && colorOf(pinner) !== colorOf(square);
    }
  }
}

function keyPositions(games: Game[]) {
  return games.flatMap((game) =>
    game.turns.flatMap((turn, i) => (turn.label === 'critical' ? [{ id: `${game.id}#${i}`, beats: walkthrough(game, i) }] : [])),
  );
}

const realTurns = Object.keys(turns).map((key) => realTurn(key as Key));
const all = keyPositions([...learnGames, italian1, italian2, ...realTurns]);

/** The position a beat's move starts from: the beat before it, or after the move that beat asked for. */
function startOf(beat: Beat, previous: Beat): string | undefined {
  const asked = previous.answer ? playLine(previous.fen, [previous.answer])[0]?.after : undefined;
  return [previous.fen, asked].find((fen) => fen && playLine(fen, [beat.move!])[0]?.after === beat.fen);
}

describe('walkthrough on every fixture key position', () => {
  it('steps through a few beats and ends on the line', () => {
    for (const { id, beats } of all) {
      expect(beats.length, id).toBeGreaterThanOrEqual(1);
      expect(beats.length, id).toBeLessThanOrEqual(5);
      expect(beats.at(-1)!.line, id).toBeDefined();
      expect(beats.slice(0, -1).every((b) => b.line === undefined), id).toBe(true);
      expect(beats.filter((b) => b.ask).length, id).toBeLessThanOrEqual(1);
    }
  });

  it('speaks in clean, short sentences', () => {
    for (const { id, beats } of all) {
      for (const text of beats.flatMap((b) => [b.text, b.ask ?? 'Ask.'])) {
        expect(text, id).toMatch(/^([A-Z]|[a-h][1-8x])/);
        expect(text, id).toMatch(/[.]$/);
        expect(text, id).not.toMatch(/undefined|null|NaN|\s{2}|\s[,.]/);
      }
      for (const beat of beats.slice(0, -1)) {
        expect(beat.text.split(' ').length, id).toBeLessThanOrEqual(28);
        // A mate is said in words, not with the sign.
        expect(beat.text, id).not.toMatch(/#/);
      }
    }
  });

  it('marks and draws on real squares only', () => {
    for (const { id, beats } of all) {
      for (const beat of beats) {
        const squares = [...beat.marks.map((m) => m.square), ...beat.arrows.flatMap((a) => [a.from, a.to])];
        for (const square of squares) expect(square, id).toMatch(/^[a-h][1-8]$/);
        expect(new Set(beat.marks.map((m) => m.square)).size, id).toBe(beat.marks.length);
      }
    }
  });

  it('asks only for legal moves, and slides each beat in from the one before', () => {
    for (const { id, beats } of all) {
      beats.forEach((beat, i) => {
        if (beat.ask) expect(playLine(beat.fen, [beat.answer!]), id).toHaveLength(1);
        if (beat.move) expect(startOf(beat, beats[i - 1]), `${id} beat ${i}`).toBeDefined();
      });
      const last = beats.at(-1)!;
      expect(playLine(last.fen, last.line!), id).toHaveLength(last.line!.length);
    }
  });

  it('gives concrete reasons in plain words', () => {
    const vague = /leaves nothing of yours hanging|^Instead, play |^The best answer is |^\S+ (guards it|moves it (to safety|away)|takes the attacker)\.$|\bhangs\b|uncovers|opens the line|^O-O|the king is behind it/;
    for (const { id, beats } of all) for (const beat of beats) expect(beat.text, id).not.toMatch(vague);
  });

  it('says only what is true on the board', () => {
    let checked = 0;
    for (const { id, beats } of all) {
      for (const beat of beats) {
        for (const claim of beat.claims ?? []) {
          expect(holds(claim.fen ?? beat.fen, claim), `${id}: ${JSON.stringify(claim)}`).toBe(true);
          checked++;
        }
      }
    }
    expect(checked).toBeGreaterThan(30);
  });
});

describe('the patterns', () => {
  it('shows a free piece: what attacks it, that nothing guards it, then takes it', () => {
    const beats = beatsOf('caro-kann-1100-0026#26');
    expect(texts(beats).slice(0, 2)).toEqual(['Your pawn on f7 attacks the queen on e6, and nothing guards it.', 'So fxe6 wins it for free.']);
    expect(beats[0].marks).toEqual([
      { square: 'e6', tone: 'focus' },
      { square: 'f7', tone: 'good' },
    ]);
    expect(beats[1]).toMatchObject({ ask: 'Your move: take the queen.', answer: 'f7e6', arrows: [{ from: 'f7', to: 'e6', tone: 'best' }] });
    // The line shows the reply too, so the user sees nothing takes back, and ends on the net result.
    expect(beats[2]).toMatchObject({ line: ['f1e2'], text: 'By the end of the line, you have won the queen.' });
  });

  it('weighs a guarded piece worth more than the one taking it, then counts the trade over the moves it shows', () => {
    const beats = beatsOf('caro-kann-1400-0002#20');
    expect(texts(beats)).toEqual([
      'The queen on c5 is guarded, but it is worth more than your bishop.',
      'So Bxc5 wins it, even if White takes back.',
      'By the end of the line, you have won the queen for a bishop.',
    ]);
    expect(beats.at(-1)!.line).toEqual(['b4c5']);
  });

  it('counts a piece lined up behind an attacker', () => {
    const beats = beatsOf('caro-kann-1400-0046#9');
    expect(beats[0].text).toBe('Your bishop on e7 and your queen behind it attack the bishop on g5, and only the knight on f3 guards it.');
    expect(beats[0].marks.map((m) => m.square)).toEqual(['g5', 'e7', 'd8', 'f3']);
    expect(beats[0].claims).toContainEqual({ claim: 'backs', square: 'd8', front: 'e7', target: 'g5' });
  });

  it('plays the line on until no capture is pending', () => {
    // Rxc8+ Rxc8 Nxf5 would stop a piece down; Bxf5 takes back, and the next capture follows too.
    expect(beatsOf('caro-kann-1400-0103#24').at(-1)!.line).toEqual(['c1c8', 'a8c8', 'd4f5', 'd3f5', 'd2b4']);
  });

  it('plays a fork, then shows both prongs from the landing square', () => {
    const beats = beatsOf('italian-1400-0006#3');
    expect(texts(beats).slice(0, 2)).toEqual([
      'From f7, your knight on g5 would attack the queen on d8 and the rook on h8.',
      'Only one of them can be saved.',
    ]);
    expect(beats[1]).toMatchObject({ move: 'g5f7', arrows: [{ from: 'f7', to: 'd8' }, { from: 'f7', to: 'h8' }] });
    expect(beats[2]).toMatchObject({ fen: beats[1].fen, line: ['d8e8', 'f7h8'] });
  });

  it('says which piece falls when a fork comes with check', () => {
    expect(walkthrough(learnGame('caro-kann-1100-0001'), 12)[1].text).toBe('White must answer the check, so the queen on f3 falls.');
  });

  it('builds a pin: the pieces on one line, the move onto it, and why the front one is stuck', () => {
    expect(texts(beatsOf('italian-2000-0026#2')).slice(0, 3)).toEqual([
      'The knight on e4 stands in front of the king, on the e-file.',
      'Re1 puts your rook on that line.',
      "It can't move: that would leave its own king in check. Black can't save it.",
    ]);
  });

  it('says why a piece pinned to the king may only move along the line', () => {
    expect(beatsOf('caro-kann-1100-0135#9')[2].text).toBe(
      "It can only move along that line: stepping off it would leave its own king in check. White can't save it.",
    );
  });

  it('uses a pin that is already there', () => {
    expect(texts(beatsOf('caro-kann-1400-0022#8')).slice(0, 2)).toEqual([
      'The knight on g5 is pinned to the queen on f4 by your bishop on h6: if it moves, your bishop can take the queen.',
      "So exf6 takes a pawn and attacks it. It can't run.",
    ]);
    expect(beatsOf('italian-1400-0013#14')[1].text).toBe("So Qxd5 wins the knight: the knight on e7 can't take back.");
    expect(beatsOf('italian-1100-0013#6')[1].text).toBe('So after Nd5 Nxd5, Bxe7 wins the queen on e7.');
  });

  it('lines up a skewer and takes the piece behind', () => {
    expect(texts(beatsOf('italian-2000-0029#15')).slice(0, 3)).toEqual([
      'The queen on c6 and the rook on a8 stand on the same diagonal.',
      'Bd5 attacks the queen along that line.',
      'When the queen steps aside, you take the rook on a8 behind it.',
    ]);
  });

  it('counts exactly two attacks in a discovered attack', () => {
    const beats = beatsOf('caro-kann-1700-0003#21');
    expect(texts(beats).slice(0, 3)).toEqual([
      'Your knight on d4 blocks the line from your queen on d6 to the queen on d2.',
      'Nf3+ moves your knight off that line.',
      'Your queen now attacks the queen on d2, and your knight gives check. Two attacks at once.',
    ]);
    expect(beats[2].arrows).toHaveLength(2);
  });

  it("counts a trapped piece's squares", () => {
    const beats = walkthrough(learnGame('italian-1400-0003'), 3);
    expect(texts(beats).slice(0, 2)).toEqual([
      'Count the squares of the knight on a5: it has three, and every one is covered.',
      'b4 attacks the knight, so it has nowhere safe to go.',
    ]);
    expect(beats[0].claims).toEqual([{ claim: 'escape-squares', square: 'a5', squares: ['c6', 'c4', 'b3'], covered: ['c6', 'c4', 'b3'] }]);
  });

  it('says when a discovered check is a double check', () => {
    expect(beatsOf('italian-1700-0104#8')[2].text).toBe(
      'Double check: your bishop and your knight both give check, so the king must move and nothing can take your knight.',
    );
  });

  it('says when a discovered attack leaves the target no safe square', () => {
    expect(beatsOf('caro-kann-1400-0123#11')[2].text).toBe('Your bishop now attacks the queen on g4, and it has no safe square to go to.');
  });

  it('counts a trapped piece once the move is played, and says what the move takes and opens', () => {
    expect(beatsOf('italian-1100-0095#16')[1].text).toBe(
      'hxg3 takes a pawn, attacks the queen and clears the h-file for your rook on h1, so it has nowhere safe to go.',
    );
  });

  it('takes away a guard, then shows the piece left hanging after the reply', () => {
    const beats = beatsOf('caro-kann-1400-0015#8');
    expect(texts(beats).slice(0, 3)).toEqual([
      'Your knight on c6 and your knight on f5 attack the pawn on d4, and two pieces guard it. Take the knight on f3, and the pawn falls.',
      'Bxf3 trades your bishop for the knight, one of the guards of the pawn on d4.',
      'Taking back pulls the queen on d1 away from it too. Now nothing guards it, and Nxd4 wins it.',
    ]);
    expect(beats[1]).toMatchObject({ ask: 'Your move: take the knight.', answer: 'g4f3' });
    expect(beats[2]).toMatchObject({ move: 'd1f3', arrows: [{ from: 'f5', to: 'd4', tone: 'best' }] });
  });

  it('says what taking the only guard does before the move, and trades like pieces as a trade', () => {
    expect(texts(beatsOf('caro-kann-2000-0113#13')).slice(0, 3)).toEqual([
      'Your queen on h3 attacks the knight on f3, and only the rook on e3 guards it. Take that guard, and the knight falls.',
      'Rxe3 trades rooks, removing the only guard of the knight on f3.',
      'Now nothing guards it, and Qxf3 wins it.',
    ]);
  });

  it('counts the guards left against the attackers once one guard is gone', () => {
    const beats = beatsOf('caro-kann-1100-0133#23');
    expect(texts(beats).slice(1, 3)).toEqual([
      'Nxf3 trades your knight for the bishop, one of the guards of the knight on b7.',
      'Now it has one guard against your two attackers, and Rbxb7 wins it.',
    ]);
    expect(beats[2].claims).toContainEqual({ claim: 'guards', square: 'b7', squares: ['b6'] });
  });

  it("boxes the king in and mates it, covering the squares it had left", () => {
    expect(texts(beatsOf('caro-kann-1400-0013#18')).slice(0, 2)).toEqual([
      'Its own pawns and pieces box the king in: only f1 and h1 are free.',
      'Re1 gives check and covers f1 and h1, so the king has no way out. The queen on f2 can\'t take it: your bishop on c5 pins it.',
    ]);
    const forced = beatsOf('italian-1100-0027#16');
    expect(texts(forced).slice(0, 3)).toEqual([
      "Qg4+ starts a forced mate. Black's best try is Kh7.",
      'The king is short of squares: only h8 is free.',
      'Qg7 gives check and covers h8, so the king has no way out. The king can\'t take your queen: your knight on f5 guards it.',
    ]);
    expect(forced.at(-1)!.line).toEqual(['g4g7']);
  });

  it('says why the checking piece cannot be taken', () => {
    expect(beatsOf('italian-1700-0049#9')[1].text).toBe(
      "Qxg6 gives check, and the king has no way out. The pawn on f7 can't take it: your bishop on b3 pins it.",
    );
  });

  it('says a piece the mate itself would take is tied to stopping it', () => {
    expect(texts(beatsOf('caro-kann-2000-0104#16')).slice(0, 2)).toEqual([
      'Rf8 attacks the queen on f1, and taking it would be mate.',
      "White can't stop the mate and keep the queen on f1.",
    ]);
  });

  it('threatens mate and wins the piece that cannot be saved as well', () => {
    expect(texts(beatsOf('italian-2000-0009#18')).slice(0, 2)).toEqual([
      'Qf5 threatens Qh7 mate.',
      "It also attacks the bishop on f6. Black can't stop the mate and save the bishop.",
    ]);
  });

  it('saves a piece in danger', () => {
    expect(texts(beatsOf('caro-kann-1100-0014#5')).slice(0, 2)).toEqual([
      'Your bishop on g4 is attacked by the bishop on e2, and nothing guards it.',
      'Bxe2 takes the bishop on e2, the piece attacking your bishop.',
    ]);
    const outnumbered = beatsOf('italian-1700-0027#7');
    expect(texts(outnumbered).slice(0, 2)).toEqual([
      'The bishop on c5 and the knight on g4 attack your pawn on f2, and only your king guards it.',
      'Re2 brings your rook to guard your pawn on f2.',
    ]);
    expect(outnumbered[0].arrows).toHaveLength(2);
  });

  it('names the piece and the square a defence uses', () => {
    const guard = beatsOf('caro-kann-1400-0182#10')[1];
    expect(guard.text).toBe('g6 brings a pawn to guard your knight on h5.');
    expect(guard.claims).toContainEqual({ claim: 'guards', square: 'h5', squares: ['g6'], fen: expect.any(String) });
    expect(beatsOf('caro-kann-2000-0206#21')[1].text).toBe('Rxe1+ trades your rook for the rook on e1.');
    expect(beatsOf('italian-1700-0024#5')[1].text).toBe('Re1+ gives check first: after Kf8, Bxd6+ takes the bishop on d6.');
  });

  it('names the attackers and the guard of a piece in danger, the king among them', () => {
    expect(beatsOf('caro-kann-2000-0016#11')[0].text).toBe(
      'The queen on e2 and the king attack your knight on e3, and only your queen on e7 guards it.',
    );
  });

  it('names every piece a forking attacker hits, and a defence that pins it', () => {
    expect(texts(beatsOf('italian-2000-0143#10')).slice(0, 2)).toEqual([
      'The pawn on d4 attacks your bishop on e3 and your knight on c3.',
      "Rad1 pins the pawn on d4 to the queen on d7, so it can't take safely.",
    ]);
  });

  it('says how the answer stops the threat', () => {
    const beats = beatsOf('caro-kann-1100-0248#18');
    expect(beats[1].text).toBe('Ne5 blocks the line from the bishop on b2 to your pawn on g7.');
    expect(beats[1].marks).toContainEqual({ square: 'b2', tone: 'focus' });
  });

  it('calls castling castling, and names the square a move clears for a trapped piece', () => {
    expect(beatsOf('italian-1100-0248#5')[1].text).toBe('Castling brings your king to guard g2, where Qxg2 would land.');
    const room = beatsOf('italian-1100-0076#11')[1];
    expect(room.text).toBe('Nc3 clears b1 for your rook on a1.');
    expect(room.claims).toEqual([{ claim: 'attacks', square: 'a1', squares: ['b1'], fen: expect.any(String) }]);
  });

  it("stops the opponent's threat", () => {
    const beats = beatsOf('caro-kann-1400-0028#11');
    expect(texts(beats)).toEqual([
      'White threatens Nc7+, checking your king and attacking your rook on a8 at the same time.',
      'Rc8 moves your rook on a8 out of the fork and guards c7, where Nc7 would land.',
      'By the end of the line, you have given up a pawn.',
    ]);
    expect(beats[0].arrows).toEqual([{ from: 'd5', to: 'c7', tone: 'threat' }]);
  });

  it('shows the trap, what it runs into, then the better move', () => {
    const beats = beatsOf('caro-kann-1100-0013#7');
    expect(texts(beats).slice(0, 3)).toEqual(['Rb8 looks quiet and safe.', 'But Bxb8 wins your rook on b8.', 'Instead, Bb4 attacks the knight on c3.']);
    expect(beats[0].arrows).toEqual([{ from: 'a8', to: 'b8', tone: 'mistake' }]);
    expect(beats[1]).toMatchObject({ move: 'a8b8', marks: [{ square: 'b8', tone: 'bad' }] });
    expect(beats[2]).toMatchObject({ fen: beats[0].fen, answer: 'f8b4' });
    expect(texts(beatsOf('italian-1400-0020#15')).slice(0, 3)).toEqual([
      'Rxc7 is tempting: it takes a pawn, and it looks free.',
      'But your rook no longer stands on a7, between the rook on a8 and your queen on a1, and Rxa1 wins it.',
      'Instead, Rxa8 takes the rook and attacks the queen on e8.',
    ]);
    expect(beatsOf('caro-kann-2000-0001#3')[1].text).toBe('But Qxf7 is checkmate.');
  });

  it('says what the better move keeps that the trap gives away', () => {
    expect(beatsOf('caro-kann-1100-0076#11')[2].text).toBe('Instead, Bb8 keeps your knight on e5 guarded.');
    expect(texts(beatsOf('caro-kann-2000-0132#18')).slice(1, 3)).toEqual([
      'But your king no longer guards c8, and Rc8 is checkmate.',
      'Instead, a6 keeps your king guarding c8.',
    ]);
    expect(texts(beatsOf('caro-kann-1400-0017#22')).slice(1, 3)).toEqual([
      'But your bishop no longer stands on h5, between the rook on h3 and h8, and Rh8 is checkmate.',
      'Instead, g6 keeps your bishop on h5 between the rook on h3 and h8.',
    ]);
  });

  it('finds a reason for a quiet better move on the board: a mate it threatens, a line it blocks', () => {
    const mate = beatsOf('italian-1100-0207#9')[2];
    expect(mate.text).toBe('Instead, Qh5 threatens Qxh7 mate.');
    expect(mate.claims).toEqual([{ claim: 'mates', move: 'h5h7', fen: expect.any(String) }]);
    expect(beatsOf('italian-1100-0240#12')[2].text).toBe('Instead, Ne4 blocks the line from the bishop on b7 to your knight on f3.');
  });

  it('falls back to the pieces and the idea when no pattern fits', () => {
    expect(texts(beatsOf('caro-kann-1100-0002#14'))).toEqual([
      'Look at your pawn on b7 and the queen on e2.',
      'b5+ starts a sequence that wins the queen for two pawns: b5+ Qxb5 cxb5+.',
    ]);
    // A tactic set up by earlier moves has its pieces elsewhere now, so only the line is shown.
    expect(beatsOf('caro-kann-1100-0015#17')).toHaveLength(1);
  });
});
