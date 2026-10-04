import { Chess } from 'chess.js';
import type { Depth, MomentType, Turn } from '../content/types';
import { captureGain, passTurn } from '../learn/board';

export interface MomentOptions {
  quick?: boolean;
  seed?: number;
  /** Let about a quarter of the critical turns be unprompted checks. Off: they are pauses like the rest. */
  silent?: boolean;
}

const SILENT_SHARE = 0.25;
const NOTHING_SHARE = 0.4;
const QUICK_MAX_PAUSES = 3;
// Past this win% either way the game is decided: win% goes flat, so a mate or a free piece grades like any other move.
const DECIDED_WIN = 90;

/** How many user moves a pause covers, counting the pause move itself. */
function playoutSpan(depth: Depth): number {
  if (depth === 5) return 6;
  if (depth === 4) return 2;
  return 1;
}

export function hashSeed(text: string): number {
  let hash = 2166136261;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffled<T>(items: T[], rand: () => number): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

// Python's round() sends halves to the even neighbour; the reference counts depend on it.
function roundHalfEven(x: number): number {
  const floor = Math.floor(x);
  if (x - floor === 0.5) return floor % 2 === 0 ? floor : floor + 1;
  return Math.round(x);
}

function indexesWhere(turns: Turn[], test: (turn: Turn, index: number) => boolean): number[] {
  return turns.flatMap((turn, i) => (test(turn, i) ? [i] : []));
}

/** Back-to-back critical turns are one idea playing out, so only the first of each run becomes a moment. */
function criticalStarts(turns: Turn[]): number[] {
  return indexesWhere(turns, (t, i) => t.label === 'critical' && !(turns[i - 1]?.label === 'critical' && turns[i - 1].ply === t.ply - 2));
}

function pickSilent(critical: number[], rand: () => number): Set<number> {
  const count = roundHalfEven(critical.length * SILENT_SHARE);
  return new Set(shuffled(critical, rand).slice(0, count));
}

function markCritical(
  turns: Turn[],
  starts: Set<number>,
  span: number,
  silent: Set<number>,
  maxPauses: number,
  moments: Map<number, MomentType>,
): void {
  let busyUntil = -1;
  let pauses = 0;
  turns.forEach((turn, i) => {
    if (turn.ply <= busyUntil) {
      moments.set(i, 'playout');
      return;
    }
    if (!starts.has(i)) return;
    if (silent.has(i)) {
      moments.set(i, 'silent');
      return;
    }
    if (pauses === maxPauses) return;
    pauses++;
    moments.set(i, 'pause');
    busyUntil = turn.ply + 2 * (span - 1);
  });
}

/** Whether the side to move has a mate in one or a capture that wins material. */
function winsAtOnce(fen: string): boolean {
  return new Chess(fen).moves({ verbose: true }).some((m) => m.san.endsWith('#') || captureGain(m) > 0);
}

/** A 'nothing' turn that really is calm: the game is open, and neither side can mate or win material at once. */
export function isCalm(turn: Turn): boolean {
  if (turn.bestWin >= DECIDED_WIN || turn.bestWin <= 100 - DECIDED_WIN) return false;
  const passed = passTurn(turn.fen);
  return passed !== null && !winsAtOnce(turn.fen) && !winsAtOnce(passed);
}

function addNothings(turns: Turn[], moments: Map<number, MomentType>, rand: () => number, quick: boolean): void {
  const pauses = [...moments.values()].filter((m) => m === 'pause').length;
  const want = quick
    ? Math.max(0, Math.min(1, QUICK_MAX_PAUSES - pauses))
    : Math.max(2, Math.ceil((pauses * NOTHING_SHARE) / (1 - NOTHING_SHARE)));
  const isFree = (i: number) => !moments.has(i - 1) && !moments.has(i) && !moments.has(i + 1);
  const candidates = indexesWhere(turns, (t, i) => t.label === 'nothing' && !t.inCheck && isFree(i));
  const mixed = shuffled(candidates, rand);
  const ordered = [...mixed.filter((i) => turns[i].trigger), ...mixed.filter((i) => !turns[i].trigger)];

  const chosen: number[] = [];
  for (const i of ordered) {
    if (chosen.length === want) break;
    if (chosen.some((c) => Math.abs(c - i) === 1) || !isCalm(turns[i])) continue;
    chosen.push(i);
    moments.set(i, 'nothing');
  }
}

/** Decide which user turns become pauses, "nothing" pauses, silent checks and play-out moves. Keys are indexes into turns. */
export function chooseMoments(turns: Turn[], depth: Depth, opts: MomentOptions = {}): Map<number, MomentType> {
  const { quick = false, seed = 1, silent: allowSilent = true } = opts;
  const rand = mulberry32(seed);
  const moments = new Map<number, MomentType>();
  const starts = criticalStarts(turns);
  const silent = quick || !allowSilent ? new Set<number>() : pickSilent(starts, rand);
  markCritical(turns, new Set(starts), playoutSpan(depth), silent, quick ? QUICK_MAX_PAUSES : Infinity, moments);
  addNothings(turns, moments, rand, quick);
  return moments;
}
