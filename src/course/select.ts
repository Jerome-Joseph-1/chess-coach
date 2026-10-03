import { LEVELS, OPENINGS } from '../content/catalog';
import { loadGame } from '../content/loader';
import type { Game, Level, OpeningId, Turn } from '../content/types';
import { themeFor, type Theme } from '../learn';
import { getLessons, playedGameIds } from '../progress/store';
import {
  DRILLS_PER_LESSON,
  UNIT_IDS,
  positionKey,
  type CourseFile,
  type PositionRef,
  type UnitEntry,
  type UnitId,
} from './types';
import { unitOfTheme } from './units';

const MAX_EXAMPLES = 3;
const MAX_DRILLS = 16;

/** A key position that teaches a unit. */
export interface Candidate {
  ref: PositionRef;
  unit: UnitId;
  /** The board without move counters, so a position reached in two games counts once. */
  position: string;
  /** How many of the example rules it passes, most important first; a clean example passes them all. */
  clarity: number;
}

/** What makes a key position a clear worked example. */
export interface ExampleFacts {
  namesPattern: boolean;
  /** The tactic starts with this move rather than after a set-up. */
  now: boolean;
  inCheck: boolean;
  /** Moves by the side playing the tactic, up to and including the move that wins. */
  movesToKey: number;
  /** Net gain of the tactic in pawns. */
  gain: number;
  mate: boolean;
  kinds: number;
  material: number;
  pieces: number;
}

// Most important first: a position that fails one rule is ranked by how many it passed before it.
const EXAMPLE_RULES: ((facts: ExampleFacts) => boolean)[] = [
  (f) => f.namesPattern,
  (f) => f.now,
  (f) => !f.inCheck,
  (f) => f.movesToKey <= 2,
  (f) => f.mate || f.gain >= 3,
  (f) => f.kinds === 1,
  (f) => Math.abs(f.material) <= 1,
  (f) => f.pieces <= 4,
];

export const CLEAN = EXAMPLE_RULES.length;

export function clarityOf(facts: ExampleFacts): number {
  const failed = EXAMPLE_RULES.findIndex((rule) => !rule(facts));
  return failed < 0 ? CLEAN : failed;
}

export function exampleFacts(turn: Turn, theme: Theme): ExampleFacts {
  const { tactic } = theme;
  return {
    namesPattern: tactic !== null && theme.id !== 'material-win' && theme.pattern !== 'material-win',
    now: tactic?.at === 0,
    inCheck: turn.inCheck,
    movesToKey: tactic ? Math.floor(tactic.key / 2) + 1 : Infinity,
    gain: tactic?.trade.net ?? 0,
    mate: tactic?.id === 'checkmate' || tactic?.id === 'mate-threat',
    kinds: turn.kinds.length,
    material: turn.material,
    pieces: theme.pieces.length,
  };
}

function boardOf(fen: string): string {
  return fen.split(' ').slice(0, 4).join(' ');
}

/** The game's key positions that a unit teaches. */
export function candidatesOf(set: string, game: Game): Candidate[] {
  return game.turns.flatMap((turn, index) => {
    if (turn.label !== 'critical') return [];
    const theme = themeFor(game, index);
    const unit = unitOfTheme(theme);
    if (!unit) return [];
    const ref: PositionRef = { set, gameId: game.id, ply: turn.ply, findShare: turn.findShare };
    return [{ ref, unit, position: boardOf(turn.fen), clarity: clarityOf(exampleFacts(turn, theme)) }];
  });
}

/** "italian-1400" read back into its opening and level; null for a name that is not a set. */
export function setOf(set: string): { opening: OpeningId; level: Level } | null {
  const match = set.match(/^([a-z-]+)-(\d+)$/);
  const opening = OPENINGS.find((o) => o.id === match?.[1])?.id;
  const level = LEVELS.find((l) => l === Number(match?.[2]));
  return opening && level ? { opening, level } : null;
}

/** The levels to draw from for a set: its own first, then the nearest, the lower one on a tie. */
export function levelsByDistance(level: Level): Level[] {
  return [...LEVELS].sort((a, b) => Math.abs(a - level) - Math.abs(b - level) || a - b);
}

const easiestFirst = (a: Candidate, b: Candidate) => b.ref.findShare - a.ref.findShare;

/** The candidates whose position is not in `taken` yet, each position once; adds them to `taken`. */
function uniquePositions(candidates: Candidate[], taken = new Set<string>()): Candidate[] {
  return candidates.filter((c) => {
    if (taken.has(c.position)) return false;
    taken.add(c.position);
    return true;
  });
}

/** `count` items evenly spaced through the list, its first and last included. */
export function spread<T>(items: T[], count: number): T[] {
  if (items.length <= count) return items;
  if (count <= 1) return items.slice(0, Math.max(count, 0));
  return Array.from({ length: count }, (_, i) => items[Math.round((i * (items.length - 1)) / (count - 1))]);
}

/**
 * Up to three worked examples among the clearest positions any pool holds: the set's own pool first,
 * then the other levels nearest first, each easiest first. `pools` hold one unit's candidates.
 */
export function pickExamples(pools: Candidate[][]): Candidate[] {
  const best = Math.max(0, ...pools.flat().map((c) => c.clarity));
  const clearest = pools.flatMap((pool) => pool.filter((c) => c.clarity === best).sort(easiestFirst));
  return uniquePositions(clearest).slice(0, MAX_EXAMPLES);
}

/**
 * Up to sixteen practice positions spread over the range of difficulty, never an example's position.
 * The set's own positions come first; other levels only fill the gap, nearest first.
 */
export function pickDrills(pools: Candidate[][], examples: Candidate[]): Candidate[] {
  const taken = new Set(examples.map((c) => c.position));
  const drills: Candidate[] = [];
  for (const pool of pools) {
    const fresh = uniquePositions([...pool].sort(easiestFirst), new Set(taken));
    const picked = spread(fresh, MAX_DRILLS - drills.length);
    picked.forEach((c) => taken.add(c.position));
    drills.push(...picked);
  }
  return drills;
}

function unitEntry(id: UnitId, pools: Candidate[][]): UnitEntry | null {
  const unitPools = pools.map((pool) => pool.filter((c) => c.unit === id));
  const examples = pickExamples(unitPools);
  if (!examples.length) return null;
  const drills = pickDrills(unitPools, examples);
  return { id, examples: examples.map((c) => c.ref), drills: drills.map((c) => c.ref) };
}

/** The set's course from the candidates of every set of its opening, keyed by set name. */
export function buildCourse(set: string, candidates: ReadonlyMap<string, Candidate[]>): CourseFile {
  const parsed = setOf(set);
  if (!parsed) throw new Error(`Not a set name: ${set}`);
  const { opening, level } = parsed;
  const pools = levelsByDistance(level).map((l) => candidates.get(`${opening}-${l}`) ?? []);
  const units = UNIT_IDS.map((id) => unitEntry(id, pools)).filter((unit) => unit !== null);
  return { v: 1, opening, level, units };
}

/** A lesson position with its game loaded. */
export interface LessonPosition {
  ref: PositionRef;
  game: Game;
  /** Index into `game.turns` of the position. */
  turnIndex: number;
}

export interface LessonPositions {
  example: LessonPosition;
  drills: LessonPosition[];
}

export interface PositionSource {
  /** The position with its game; null when the game cannot be loaded or does not hold the position. */
  load(ref: PositionRef): Promise<LessonPosition | null>;
  /** Its game was played or practised already, or it was answered in this unit. */
  seen(ref: PositionRef): boolean;
}

/** Practice candidates in the order to try them: fresh ones first, then those seen before, each in course order. */
export function practiceOrder(drills: PositionRef[], seen: (ref: PositionRef) => boolean): PositionRef[] {
  return [...drills.filter((ref) => !seen(ref)), ...drills.filter(seen)];
}

/** Up to `count` of the refs that load, in order; loads only as many as are still needed at a time. */
async function firstLoaded(refs: PositionRef[], count: number, load: PositionSource['load']): Promise<LessonPosition[]> {
  const loaded: LessonPosition[] = [];
  let next = 0;
  while (loaded.length < count && next < refs.length) {
    const batch = refs.slice(next, next + count - loaded.length);
    next += batch.length;
    for (const position of await Promise.all(batch.map(load))) if (position) loaded.push(position);
  }
  return loaded;
}

export async function loadPosition(ref: PositionRef): Promise<LessonPosition | null> {
  const set = setOf(ref.set);
  if (!set) return null;
  try {
    const game = await loadGame(set.opening, set.level, ref.gameId);
    const turnIndex = game.turns.findIndex((turn) => turn.ply === ref.ply);
    return turnIndex < 0 ? null : { ref, game, turnIndex };
  } catch {
    return null;
  }
}

function deviceSource(opening: OpeningId, unit: UnitId): PositionSource {
  const answered = new Set(getLessons(opening)[unit]?.drills.map((d) => d.key));
  const played = new Map<string, Set<string>>();
  const playedIn = (set: string) => {
    if (!played.has(set)) {
      const parsed = setOf(set);
      played.set(set, new Set(parsed ? playedGameIds(parsed.opening, parsed.level) : []));
    }
    return played.get(set)!;
  };
  return {
    load: loadPosition,
    seen: (ref) => answered.has(positionKey(ref)) || playedIn(ref.set).has(ref.gameId),
  };
}

/**
 * The unit's worked example, the first candidate that loads, and up to four practice positions:
 * from games not played or practised yet and not answered in this unit, else from ones seen before.
 * Null when the course has no such unit or none of its examples loads.
 */
export async function pickLesson(course: CourseFile, unit: UnitId, source = deviceSource(course.opening, unit)): Promise<LessonPositions | null> {
  const entry = course.units.find((u) => u.id === unit);
  if (!entry) return null;
  const [example] = await firstLoaded(entry.examples, 1, source.load);
  if (!example) return null;
  const drills = await firstLoaded(practiceOrder(entry.drills, source.seen), DRILLS_PER_LESSON, source.load);
  return { example, drills };
}
