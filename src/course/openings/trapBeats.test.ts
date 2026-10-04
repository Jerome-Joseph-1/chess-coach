import { Chess, type Square } from 'chess.js';
import { describe, expect, it } from 'vitest';
import type { Game } from '../../content/types';
import { playLine } from '../../learn/board';
import { trapBeats } from './trapBeats';
import { readTraps } from './trapGames';

const games: Game[] = readTraps().map((trap) => ({ ...trap, level: 1400 }));
const examples = games.filter((game) => (game as Game & { role: string }).role === 'example');
const beatsOf = (id: string) => trapBeats(games.find((game) => game.id === id)!)!;
const sentences = (text: string) => text.split(/(?<=[.?!])\s+/);

/** Whether the piece on `from` attacks `to`, by its own colour, on `fen`. */
function attacks(fen: string, from: Square, to: Square): boolean {
  const board = new Chess(fen);
  return board.attackers(to, board.get(from)!.color).includes(from);
}

describe('trapBeats', () => {
  it('has a worked example for each trap lesson, and none for practice positions', () => {
    expect(examples.map((game) => game.id).sort()).toEqual(['trap-caro-kann-qe2', 'trap-italian-shilling']);
    for (const game of games) expect(trapBeats(game) !== null, game.id).toBe(examples.includes(game));
  });

  it('passes the checks every worked example meets', () => {
    for (const game of examples) {
      const beats = trapBeats(game)!;
      expect(beats.length).toBeLessThanOrEqual(5);
      expect(beats.filter((b) => b.ask)).toHaveLength(1);
      expect(beats.slice(0, -1).every((b) => b.line === undefined)).toBe(true);
      for (const beat of beats) {
        for (const text of [beat.text, beat.ask ?? 'Ask.']) {
          expect(text, game.id).toMatch(/^([A-Z]|[a-h][1-8x])/);
          expect(text, game.id).toMatch(/[.]$/);
          expect(text, game.id).not.toMatch(/undefined|null|NaN|\s{2}|\s[,.]/);
        }
        const squares = [...beat.marks.map((m) => m.square), ...beat.arrows.flatMap((a) => [a.from, a.to])];
        for (const square of squares) expect(square, game.id).toMatch(/^[a-h][1-8]$/);
      }
      for (const beat of beats.slice(0, -1)) {
        expect(beat.text.split(' ').length, beat.text).toBeLessThanOrEqual(28);
        expect(beat.text, game.id).not.toMatch(/#/);
      }
      for (const text of beats.flatMap((b) => [b.text, b.ask ?? ''])) {
        for (const sentence of sentences(text)) expect(sentence.split(' ').length, sentence).toBeLessThanOrEqual(20);
        expect(text, game.id).not.toMatch(/\bhit/i);
      }
      const last = beats.at(-1)!;
      expect(playLine(last.fen, last.line!), game.id).toHaveLength(last.line!.length);
    }
  });

  it('asks for the safe move, then plays the engine line on from it', () => {
    for (const game of examples) {
      const [turn] = game.turns;
      const beats = trapBeats(game)!;
      const ask = beats.find((b) => b.ask)!;
      expect(ask.fen).toBe(turn.fen);
      expect(ask.answer).toBe(turn.lines.best![0]);
      expect(playLine(turn.fen, [ask.answer!])[0].san).toBe(game.moves[0]);
      expect(beats.at(-1)!.line).toEqual(turn.lines.best!.slice(1));
      expect(beats[1].fen).toBe(playLine(turn.fen, turn.lines.mistake!.slice(0, 2))[1].after);
    }
  });

  it('says only what is true on the board in the Blackburne Shilling', () => {
    const [look, whatIf, ask] = beatsOf('trap-italian-shilling');
    const board = new Chess(look.fen);
    expect(board.attackers('e5', 'b')).toEqual([]);
    expect([board.get('c6'), board.get('d4')]).toEqual([undefined, { type: 'n', color: 'b' }]);
    expect(attacks(look.fen, 'f3', 'e5')).toBe(true);
    const after = new Chess(whatIf.fen);
    expect(attacks(whatIf.fen, 'g5', 'e5') && attacks(whatIf.fen, 'g5', 'g2')).toBe(true);
    expect([after.get('f5'), after.get('g4'), after.get('g3')]).toEqual([undefined, undefined, undefined]);
    expect(after.get('e5')).toEqual({ type: 'n', color: 'w' });
    const traded = new Chess(playLine(ask.fen, [ask.answer!])[0].after);
    expect(traded.moves({ verbose: true }).filter((m) => m.to === 'd4').map((m) => m.san)).toEqual(['exd4']);
  });

  it('says only what is true on the board in the Nd6 mate', () => {
    const [look, whatIf, ask, ending] = beatsOf('trap-caro-kann-qe2');
    const board = new Chess(look.fen);
    expect([board.get('e2'), board.get('e4'), board.get('e7'), board.get('e8')]).toEqual([
      { type: 'q', color: 'w' },
      { type: 'n', color: 'w' },
      { type: 'p', color: 'b' },
      { type: 'k', color: 'b' },
    ]);
    expect([board.get('e3'), board.get('e5'), board.get('e6')]).toEqual([undefined, undefined, undefined]);
    const mated = new Chess(whatIf.fen);
    expect(mated.isCheckmate()).toBe(true);
    // Only the pawn on e7 stands between the queen on e2 and the king.
    expect(['e3', 'e4', 'e5', 'e6'].map((s) => mated.get(s as Square))).toEqual([undefined, undefined, undefined, undefined]);
    expect(mated.get('e7')).toEqual({ type: 'p', color: 'b' });
    const after = playLine(ask.fen, [ask.answer!])[0].after;
    expect(attacks(after, 'f6', 'e4') && attacks(after, 'd8', 'd6')).toBe(true);
    expect(new Chess(after).get('d7')).toBeUndefined();
    const check = new Chess(ending.fen);
    check.move('Nd6+');
    expect(check.moves()).toContain('Qxd6');
  });
});
