// Opening names and the coach's notes on the moves of the opening, looked up by the moves played so far.
import { Chess } from 'chess.js';
import type { OpeningId } from '../content/types';
import { epd } from './epd';
import names from './names.json';
import { FAMILIES } from './notes';

export interface OpeningName {
  eco: string;
  name: string;
}

export interface OpeningNote {
  /** Stable id, used to count how often the note has been shown. */
  id: string;
  /** The variation it belongs to, shown above the note, e.g. "Two Knights Defence". */
  name: string | null;
  text: string;
}

/** A family of lines and the plan behind it, e.g. the Two Knights Defence with 4.Ng5. */
export interface Variation {
  id: string;
  name: string;
  plan: string;
}

interface NoteIndex {
  /** Plans by the position that starts their family, whatever the move order. */
  plans: Map<string, OpeningNote>;
  /** Notes on a move, by the position it leads to and the move itself. */
  moves: Map<string, OpeningNote>;
}

const NAMES = new Map<string, OpeningName>(
  Object.entries(names as Record<string, Record<string, string>>).flatMap(([group, positions]) =>
    Object.entries(positions).map(([position, entry]): [string, OpeningName] => [position, parseName(group, entry)]),
  ),
);

let index: NoteIndex | null = null;

/** "C55 Two Knights Defense" in the group "Italian Game" is "Italian Game: Two Knights Defense". */
function parseName(group: string, entry: string): OpeningName {
  const variation = entry.slice(4);
  return { eco: entry.slice(0, 3), name: variation ? `${group}: ${variation}` : group };
}

/** The FEN after each move, as far as the moves are legal. */
function fensAfter(sans: string[]): string[] {
  const chess = new Chess();
  const fens: string[] = [];
  try {
    for (const san of sans) {
      chess.move(san);
      fens.push(chess.fen());
    }
  } catch {
    // an illegal move ends the line
  }
  return fens;
}

/** Plays lines that share their first moves, replaying only the moves not seen before. */
function linePlayer(): (sans: string[]) => string {
  const fens = new Map<string, string>([['', new Chess().fen()]]);
  return (sans) => {
    let known = sans.length;
    while (!fens.has(sans.slice(0, known).join(' '))) known--;
    const chess = new Chess(fens.get(sans.slice(0, known).join(' ')));
    for (let i = known; i < sans.length; i++) {
      chess.move(sans[i]);
      fens.set(sans.slice(0, i + 1).join(' '), chess.fen());
    }
    return chess.fen();
  };
}

const split = (line: string) => line.split(' ').filter(Boolean);

function buildIndex(): NoteIndex {
  const play = linePlayer();
  const plans = new Map<string, OpeningNote>();
  const moves = new Map<string, OpeningNote>();
  for (const family of new Set(Object.values(FAMILIES).flat())) {
    const [first] = family.lines;
    if (family.plan) {
      const note = { id: family.id, name: family.name, text: family.plan };
      for (const line of family.lines) plans.set(epd(play(split(line))), note);
    }
    for (const [after, text] of Object.entries(family.notes)) {
      const sans = [...split(first), ...split(after)];
      moves.set(`${epd(play(sans))} ${sans.at(-1)}`, { id: `${family.id}:${after}`, name: family.name, text });
    }
  }
  return { plans, moves };
}

function noteIndex(): NoteIndex {
  index ??= buildIndex();
  return index;
}

/** The deepest named opening the moves reach, e.g. "Italian Game: Two Knights Defense". */
export function nameAt(sans: string[]): OpeningName | null {
  let found: OpeningName | null = null;
  for (const fen of fensAfter(sans)) found = NAMES.get(epd(fen)) ?? found;
  return found;
}

/** The coach's note on a position reached with `lastSan`: the plan where a family starts, else the note on that move. */
export function noteFor(fen: string, lastSan: string | null): OpeningNote | null {
  const { plans, moves } = noteIndex();
  const position = epd(fen);
  return plans.get(position) ?? moves.get(`${position} ${lastSan}`) ?? null;
}

/** The coach's note for the position these moves reach, if there is one. */
export function noteAt(sans: string[]): OpeningNote | null {
  const fens = fensAfter(sans);
  return sans.length > 0 && fens.length === sans.length ? noteFor(fens.at(-1)!, sans.at(-1)!) : null;
}

/** The variation that starts at this position, if one does. */
export function variationAt(fen: string): Variation | null {
  const note = noteIndex().plans.get(epd(fen));
  return note ? { id: note.id, name: note.name!, plan: note.text } : null;
}

/** The opening's variations with a plan, in teaching order. */
export function variationsOf(opening: OpeningId): Variation[] {
  return FAMILIES[opening].flatMap(({ id, name, plan }) => (plan ? [{ id, name, plan }] : []));
}

/** The variations whose plan has been shown in a game, given how often each note has been seen. */
export function variationsMet(opening: OpeningId, seenCount: (id: string) => number): Variation[] {
  return variationsOf(opening).filter(({ id }) => seenCount(id) > 0);
}

/** How long a note stays before autoplay moves on: enough to read it. */
export function readingMs(text: string): number {
  const words = text.trim().split(/\s+/).length;
  return Math.min(6000, Math.max(2000, words * 240));
}
