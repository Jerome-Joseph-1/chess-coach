import type { Depth, MomentType, Turn } from '../content/types';

export interface MomentOptions {
  quick?: boolean;
  seed?: number;
}

const SILENT_SHARE = 0.25;
const NOTHING_SHARE = 0.4;
const QUICK_MAX_PAUSES = 3;

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

function pickSilent(turns: Turn[], rand: () => number): Set<number> {
  const critical = indexesWhere(turns, (t) => t.label === 'critical');
  const count = roundHalfEven(critical.length * SILENT_SHARE);
  return new Set(shuffled(critical, rand).slice(0, count));
}

function markCritical(
  turns: Turn[],
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
    if (turn.label !== 'critical') return;
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
    if (chosen.some((c) => Math.abs(c - i) === 1)) continue;
    chosen.push(i);
    moments.set(i, 'nothing');
  }
}

/** Decide which user turns become pauses, "nothing" pauses, silent checks and play-out moves. Keys are indexes into turns. */
export function chooseMoments(turns: Turn[], depth: Depth, opts: MomentOptions = {}): Map<number, MomentType> {
  const { quick = false, seed = 1 } = opts;
  const rand = mulberry32(seed);
  const moments = new Map<number, MomentType>();
  const silent = quick ? new Set<number>() : pickSilent(turns, rand);
  markCritical(turns, playoutSpan(depth), silent, quick ? QUICK_MAX_PAUSES : Infinity, moments);
  addNothings(turns, moments, rand, quick);
  return moments;
}
