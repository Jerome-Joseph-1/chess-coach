import { Chess } from 'chess.js';
import { describe, expect, it } from 'vitest';
import { playLine } from '../../learn/board';
import { HOLD_MAX } from '../../pause/flow';
import { DRILLS_PER_LESSON, OPENING_LESSON_IDS } from '../types';
import { readTraps } from './trapGames';
import { TRAP_LESSONS, TRAP_TEXTS } from './traps';

const traps = readTraps();
const LOSES = 10;
const MAX_WORDS = 20;

const sentences = (text: string) => text.split(/(?<=[.?!])\s+/);

/** The position after the game's opening moves, or null when one of them is illegal. */
function replay(sans: string[]): Chess | null {
  const chess = new Chess();
  try {
    for (const san of sans) chess.move(san);
  } catch {
    return null;
  }
  return chess;
}

describe('the trap positions in traps.json', () => {
  it('replay legally to the user’s move, at the position the turn names', () => {
    for (const trap of traps) {
      const chess = replay(trap.start);
      expect(chess, trap.id).not.toBeNull();
      expect(chess!.turn(), trap.id).toBe(trap.side);
      expect(trap.turns).toHaveLength(1);
      expect(chess!.fen(), trap.id).toBe(trap.turns[0].fen);
      expect(trap.turns[0].ply, trap.id).toBe(0);
    }
  });

  it('answer with a legal move that holds', () => {
    for (const trap of traps) {
      const [turn] = trap.turns;
      const [answer] = playLine(turn.fen, turn.lines.best ?? []);
      expect(answer?.san, trap.id).toBe(trap.moves[0]);
      expect(turn.grades[turn.lines.best![0]], trap.id).toBeLessThanOrEqual(HOLD_MAX);
    }
  });

  it('belong to a trap lesson of their own opening', () => {
    for (const trap of traps) {
      expect(OPENING_LESSON_IDS[trap.opening] as readonly string[], trap.id).toContain(trap.lesson);
      expect(TRAP_LESSONS[trap.lesson as keyof typeof TRAP_LESSONS]?.opening, trap.id).toBe(trap.opening);
    }
  });

  it('play out every stored line, and a trap to dodge loses', () => {
    for (const trap of traps) {
      const [turn] = trap.turns;
      for (const line of Object.values(turn.lines)) expect(playLine(turn.fen, line), trap.id).toHaveLength(line.length);
      if (turn.kinds.includes('trap')) {
        expect(turn.lines.mistake?.[0], trap.id).toBe(turn.mistakeMove);
        expect(turn.grades[turn.mistakeMove!], trap.id).toBeGreaterThanOrEqual(LOSES);
      } else {
        expect(turn.kinds, trap.id).toEqual(['win']);
      }
    }
  });

  it('give each trap lesson one worked example and a full round of practice', () => {
    for (const lesson of Object.values(TRAP_LESSONS)) {
      const own = traps.filter((trap) => trap.lesson === lesson.id);
      expect(own.filter((trap) => trap.role === 'example'), lesson.id).toHaveLength(1);
      expect(own.filter((trap) => trap.role === 'drill').length, lesson.id).toBeGreaterThanOrEqual(DRILLS_PER_LESSON);
    }
  });

  it('come with their own texts, in plain sentences', () => {
    expect(Object.keys(TRAP_TEXTS).sort()).toEqual(traps.map((trap) => trap.id).sort());
    for (const trap of traps) {
      for (const text of [trap.title!, trap.ask!, trap.why!]) {
        expect(text, trap.id).toMatch(/^[A-Z]/);
        expect(text, trap.id).not.toMatch(/#|\s{2}/);
      }
      expect(trap.ask, trap.id).toMatch(/[.?]$/);
      expect(trap.why, trap.id).toMatch(/\.$/);
    }
  });

  it('keep every sentence of the trap texts short, and say "attacks", not "hits"', () => {
    const lessons = Object.values(TRAP_LESSONS).flatMap((l) => [l.line, l.intro, ...l.spot, l.hint, l.idea, l.remember]);
    const own = Object.values(TRAP_TEXTS).flatMap((t) => [t.title, t.ask, t.why]);
    for (const text of [...lessons, ...own]) {
      for (const sentence of sentences(text)) expect(sentence.split(' ').length, sentence).toBeLessThanOrEqual(MAX_WORDS);
      expect(text).not.toMatch(/\bhit/i);
    }
  });
});
