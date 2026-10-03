import { Chess } from 'chess.js';
import { describe, expect, it } from 'vitest';
import { OPENINGS } from '../content/catalog';
import { epd } from './epd';
import { nameAt, noteAt, noteFor, readingMs, variationAt, variationsMet, variationsOf } from '.';
import { FAMILIES, type Family } from './notes';

const ITALIAN = ['e4', 'e5', 'Nf3', 'Nc6', 'Bc4'];
const MAX_WORDS = 25;
// Three lines under the board on a 375pt phone.
const MAX_CHARS = 120;

const split = (line: string) => line.split(' ').filter(Boolean);

function play(sans: string[]): Chess {
  const chess = new Chess();
  sans.forEach((san) => chess.move(san));
  return chess;
}

interface Written {
  family: Family;
  sans: string[];
  text: string;
  plan: boolean;
}

const families = () => [...new Set(Object.values(FAMILIES).flat())];

function written(): Written[] {
  return families().flatMap((family) => [
    ...(family.plan ? family.lines.map((line) => ({ family, sans: split(line), text: family.plan!, plan: true })) : []),
    ...Object.entries(family.notes).map(([after, text]) => ({ family, sans: [...split(family.lines[0]), ...split(after)], text, plan: false })),
  ]);
}

describe('the notes as written', () => {
  it('follow legal moves from the start of their opening', () => {
    for (const { family, sans } of written()) {
      expect(() => play(sans), `${family.id}: ${sans.join(' ')}`).not.toThrow();
      for (const [opening, list] of Object.entries(FAMILIES)) {
        if (!list.includes(family)) continue;
        const start = OPENINGS.find((o) => o.id === opening)!.start;
        const shared = Math.min(start.length, sans.length);
        expect(sans.slice(0, shared), family.id).toEqual(start.slice(0, shared));
      }
    }
  });

  it('are short enough to read under the board', () => {
    for (const { family, text } of written()) {
      expect(text.split(/\s+/).length, `${family.id}: ${text}`).toBeLessThanOrEqual(MAX_WORDS);
      expect(text.length, `${family.id}: ${text}`).toBeLessThanOrEqual(MAX_CHARS);
      expect(text, family.id).toMatch(/^[\x20-\x7e]+$/);
    }
  });

  it('give each position one note: a plan where a family starts, else one note per move that reaches it', () => {
    const plans = new Map<string, string>();
    const moves = new Map<string, string>();
    for (const { family, sans, plan } of written()) {
      const position = epd(play(sans).fen());
      if (plan) {
        expect(plans.get(position) ?? family.id, sans.join(' ')).toBe(family.id);
        plans.set(position, family.id);
      } else {
        const key = `${position} ${sans.at(-1)}`;
        expect(moves.has(key), `${family.id}: ${sans.join(' ')}`).toBe(false);
        moves.set(key, family.id);
      }
    }
    for (const key of moves.keys()) expect(plans.has(key.split(' ').slice(0, 4).join(' ')), key).toBe(false);
  });

  it('never start a family inside another start of the same family', () => {
    for (const family of families()) {
      const starts = family.lines.map((line) => epd(play(split(line)).fen()));
      expect(new Set(starts).size, family.id).toBe(starts.length);
    }
  });

  it('have unique family ids', () => {
    const ids = families().map((f) => f.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('noteAt', () => {
  it('explains the last move of the trunk, under the opening name', () => {
    expect(noteAt(ITALIAN)).toEqual({
      id: 'italian:e4 e5 Nf3 Nc6 Bc4',
      name: 'Italian Game',
      text: expect.stringContaining('f7'),
    });
  });

  it('shows the plan where a family starts', () => {
    expect(noteAt([...ITALIAN, 'Nf6', 'Ng5'])).toEqual({ id: 'two-knights-ng5', name: 'Two Knights: 4.Ng5', text: expect.stringContaining('f7') });
  });

  it('finds a plan reached by another move order', () => {
    const viaNc3 = noteAt(['e4', 'c6', 'Nc3', 'd5', 'Nf3']);
    expect(viaNc3?.id).toBe('caro-kann-two-knights');
    expect(noteAt(['e4', 'c6', 'Nf3', 'd5', 'Nc3'])).toEqual(viaNc3);
  });

  it('only explains a move when it is the move that was played', () => {
    // The same position, reached with a different last move, has its own note.
    const pianissimo = noteAt([...ITALIAN, 'Bc5', 'd3', 'Nf6']);
    const twoKnights = noteAt([...ITALIAN, 'Nf6', 'd3', 'Bc5']);
    expect(pianissimo?.id).toBe('giuoco-pianissimo:Nf6');
    expect(twoKnights?.id).toBe('two-knights-d3:Bc5');
  });

  it('has nothing to say past the opening, about illegal moves or before the first move', () => {
    expect(noteAt([...ITALIAN, 'a6', 'a3', 'a5', 'a4'])).toBeNull();
    expect(noteAt(['e4', 'e4'])).toBeNull();
    expect(noteAt([])).toBeNull();
  });

  it('matches noteFor on the position and last move', () => {
    const sans = [...ITALIAN, 'Nf6', 'Ng5', 'd5', 'exd5', 'Na5'];
    expect(noteFor(play(sans).fen(), 'Na5')).toEqual(noteAt(sans));
    expect(noteFor(play(sans).fen(), 'Nb7')).toBeNull();
  });
});

describe('variations', () => {
  it('lists the families with a plan for each opening, trunk left out', () => {
    const italian = variationsOf('italian');
    expect(italian.map((v) => v.id)).toContain('two-knights-ng5');
    expect(italian.map((v) => v.id)).not.toContain('italian');
    expect(variationsOf('caro-kann').length).toBeGreaterThanOrEqual(12);
    expect(italian.length).toBeGreaterThanOrEqual(12);
  });

  it('lists as met the variations whose plan has been shown, in teaching order', () => {
    const seen: Record<string, number> = { 'two-knights-ng5': 1, 'giuoco-piano': 2, 'two-knights-ng5:d5': 2, italian: 1 };
    expect(variationsMet('italian', (id) => seen[id] ?? 0).map((v) => v.id)).toEqual(['giuoco-piano', 'two-knights-ng5']);
    expect(variationsMet('caro-kann', (id) => seen[id] ?? 0)).toEqual([]);
  });

  it('knows which variation starts at a position', () => {
    expect(variationAt(play([...ITALIAN, 'Bc5', 'b4']).fen())?.name).toBe('Evans Gambit');
    expect(variationAt(play(ITALIAN).fen())).toBeNull();
  });
});

describe('nameAt', () => {
  it('names the deepest named position the moves reach', () => {
    expect(nameAt(ITALIAN)).toEqual({ eco: 'C50', name: 'Italian Game' });
    const fried = [...ITALIAN, 'Nf6', 'Ng5', 'd5', 'exd5', 'Nxd5', 'Nxf7'];
    expect(nameAt(fried)?.name).toBe('Italian Game: Two Knights Defense, Fried Liver Attack');
    expect(nameAt([...fried, 'Kxf7', 'Qf3+', 'Ke6', 'Nc3', 'Ncb4', 'a3'])?.name).toMatch(/Fried Liver/);
  });

  it('finds names reached by another move order', () => {
    expect(nameAt(['e4', 'c6', 'Nf3', 'd5', 'Nc3'])?.name).toBe('Caro-Kann Defense: Two Knights Attack');
  });

  it('stops at an illegal move and has no name for no moves', () => {
    expect(nameAt(['e4', 'c6', 'e4'])?.name).toBe('Caro-Kann Defense');
    expect(nameAt([])).toBeNull();
  });
});

describe('readingMs', () => {
  it('gives longer notes more time, within bounds', () => {
    expect(readingMs('Short.')).toBe(2000);
    expect(readingMs(Array(20).fill('word').join(' '))).toBe(4800);
    expect(readingMs(Array(80).fill('word').join(' '))).toBe(6000);
  });
});
