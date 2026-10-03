import { Chess } from 'chess.js';
import { CONTENT_URL, loadGame, loadSet } from '../content/loader';
import type { Game, Level, OpeningId, Side, Turn } from '../content/types';
import { KEYS, isRecord, readJson, writeJson } from '../progress/storage';

const PARALLEL_LOADS = 6;

export type Vote = 'up' | 'down';

export interface PilotNote {
  vote?: Vote;
  note?: string;
}

export type PilotNotes = Record<string, PilotNote>;

/** A turn the pipeline labelled critical or nothing, waiting for a human verdict. */
export interface PilotItem {
  key: string;
  opening: OpeningId;
  level: Level;
  gameId: string;
  side: Side;
  turn: Turn;
}

export function pilotItems(game: Game): PilotItem[] {
  return game.turns
    .filter((turn) => turn.label === 'critical' || turn.label === 'nothing')
    .map((turn) => ({ key: `${game.id}:${turn.ply}`, opening: game.opening, level: game.level, gameId: game.id, side: game.side, turn }));
}

function parseSetKey(key: string): { opening: OpeningId; level: Level } {
  const cut = key.lastIndexOf('-');
  return { opening: key.slice(0, cut) as OpeningId, level: Number(key.slice(cut + 1)) as Level };
}

/** Every critical and nothing turn of every set in the manifest, in file order. */
export async function loadPilotItems(onProgress: (done: number, total: number) => void): Promise<PilotItem[]> {
  const manifest: { sets: string[] } = await (await fetch(`${CONTENT_URL}manifest.json`)).json();
  const jobs: { opening: OpeningId; level: Level; id: string }[] = [];
  for (const key of manifest.sets) {
    const { opening, level } = parseSetKey(key);
    const index = await loadSet(opening, level);
    for (const game of index?.games ?? []) jobs.push({ opening, level, id: game.id });
  }
  const games: Game[] = [];
  for (let i = 0; i < jobs.length; i += PARALLEL_LOADS) {
    const batch = await Promise.all(jobs.slice(i, i + PARALLEL_LOADS).map((j) => loadGame(j.opening, j.level, j.id)));
    games.push(...batch);
    onProgress(games.length, jobs.length);
  }
  return games.flatMap(pilotItems);
}

/** The same position with the other side to move: how a threat line starts. */
export function flipTurn(fen: string): string {
  const [pieces, turn, castling, , half, full] = fen.split(' ');
  const blackToMove = turn === 'b';
  return [pieces, blackToMove ? 'w' : 'b', castling, '-', half, blackToMove ? Number(full) + 1 : full].join(' ');
}

/** A uci line from a position as numbered SAN, e.g. "5.dxe5 d5 6.Bxd5". */
export function sanLine(fen: string, uci: string[]): string {
  let chess: Chess;
  try {
    chess = new Chess(fen);
  } catch {
    return uci.join(' ');
  }
  const parts: string[] = [];
  for (const [i, move] of uci.entries()) {
    const white = chess.turn() === 'w';
    const number = chess.moveNumber();
    let san: string;
    try {
      san = chess.move({ from: move.slice(0, 2), to: move.slice(2, 4), promotion: move[4] }).san;
    } catch {
      break;
    }
    if (white) parts.push(`${number}.${san}`);
    else parts.push(i === 0 ? `${number}...${san}` : san);
  }
  return parts.join(' ');
}

export function loadNotes(): PilotNotes {
  const raw = readJson(KEYS.pilot);
  const stored = isRecord(raw) && isRecord(raw.notes) ? raw.notes : {};
  const notes: PilotNotes = {};
  for (const [key, value] of Object.entries(stored)) {
    if (!isRecord(value)) continue;
    const entry: PilotNote = {};
    if (value.vote === 'up' || value.vote === 'down') entry.vote = value.vote;
    if (typeof value.note === 'string' && value.note) entry.note = value.note;
    if (entry.vote || entry.note) notes[key] = entry;
  }
  return notes;
}

export function saveNotes(notes: PilotNotes): void {
  writeJson(KEYS.pilot, { v: 1, notes });
}

export function reviewedCount(items: PilotItem[], notes: PilotNotes): number {
  return items.filter((item) => notes[item.key]?.vote).length;
}

export function exportReviews(items: PilotItem[], notes: PilotNotes, now = Date.now()): string {
  const reviewed = items.filter((item) => notes[item.key]);
  return JSON.stringify(
    {
      exportedAt: new Date(now).toISOString(),
      reviewed: reviewedCount(items, notes),
      total: items.length,
      items: reviewed.map(({ key, opening, level, gameId, turn }) => ({
        key,
        opening,
        level,
        gameId,
        ply: turn.ply,
        moveNo: turn.moveNo,
        label: turn.label,
        kinds: turn.kinds,
        wrongShare: turn.wrongShare,
        findShare: turn.findShare,
        source: turn.source,
        vote: notes[key].vote ?? null,
        note: notes[key].note ?? '',
      })),
    },
    null,
    2,
  );
}
