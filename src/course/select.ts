import { Chess, type Color, type Move } from 'chess.js';
import { LEVELS, OPENINGS } from '../content/catalog';
import { loadGame } from '../content/loader';
import type { Game, Level, OpeningId, Turn } from '../content/types';
import { themeFor, type Tactic, type Theme } from '../learn';
import { VALUE, pieceOn } from '../learn/board';
import { isWin } from '../learn/themes';
import { tradeOf } from '../learn/trade';
import { shownLine } from '../learn/walkthrough';
import { getLessons, playedGameIds } from '../progress/store';
import { OPENING_LESSONS } from './openings';
import { trapEntry } from './openings/trapGames';
import type { TrapGame } from './openings/types';
import { OPENING_LESSON_IDS, UNIT_IDS, isOpeningLessonId, positionKey, type CourseFile, type LessonId, type PositionRef, type UnitEntry } from './types';
import { unitOfTheme } from './units';

const MAX_EXAMPLES = 3;
const MAX_DRILLS = 16;
/** The user's win% after the best move that a winning example needs. */
const WIN_SHARE = 75;
/** Net pawns a winning example must show it wins, unless it mates. */
const MIN_GAIN = 2;
/** Share of players at the level who play a trap's tempting move, below which nobody is tempted. */
const LURE_SHARE = 0.1;
/** Win% by which the best move must beat every other analysed move to be the clear answer. */
const CLEAR_MARGIN = 2;

/** A key position that teaches a lesson. */
export interface Candidate {
  ref: PositionRef;
  unit: LessonId;
  /** The board without move counters, so a position reached in two games counts once. */
  position: string;
  /** How many of the example rules it passes, most important first; a clean example passes them all. */
  clarity: number;
  /** The engine and the line it shows back the example: it wins what it says, or the defence holds. */
  sound: boolean;
  /** Textbook cases first within a unit: a mate before a mate threat, a piece nobody guards before a counted one. */
  tier: number;
  /** Another move is about as good, so the move the example asks for is not the clear answer. */
  contested: boolean;
  /** The pattern and the squares it plays on, so a unit doesn't show the same picture twice. */
  picture: string;
  /** A plan position: whether the worked example's text holds here; false keeps it to practice. */
  textbook?: boolean;
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

/** The facts of an example; a win's `gain` counts only the moves the example shows. */
export function exampleFacts(turn: Turn, theme: Theme, shown: Move[], side: Color): ExampleFacts {
  const { tactic } = theme;
  return {
    namesPattern: tactic !== null && theme.id !== 'material-win' && theme.pattern !== 'material-win',
    now: tactic?.at === 0,
    inCheck: turn.inCheck,
    movesToKey: tactic ? Math.floor(tactic.key / 2) + 1 : Infinity,
    gain: isWin(theme) ? tradeOf(shown, side).net : (tactic?.trade.net ?? 0),
    mate: tactic?.id === 'checkmate' || tactic?.id === 'mate-threat',
    kinds: turn.kinds.length,
    material: turn.material,
    pieces: theme.pieces.length,
  };
}

export function boardOf(fen: string): string {
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
    const shown = shownLine(turn, theme, game.side);
    return [
      {
        ref,
        unit,
        position: boardOf(turn.fen),
        clarity: clarityOf(exampleFacts(turn, theme, shown, game.side)),
        sound: isSound(turn, theme, shown, game.side),
        tier: tierOf(theme),
        contested: isContested(turn),
        picture: `${unit} ${theme.pieces.map((p) => `${p.role}:${p.type}${p.square}`).sort().join(' ')}`,
      },
    ];
  });
}

/** Whether the example holds up: a win is backed by the engine and wins in the line shown; a defence loses nothing there. */
export function isSound(turn: Turn, theme: Theme, shown: Move[], side: Color): boolean {
  const net = tradeOf(shown, side).net;
  switch (theme.id) {
    case 'hanging-own':
    case 'threat-other':
      return net >= 0;
    case 'bait':
      return net >= 0 && isTempting(turn, theme);
    default: {
      const mates = shown.some((m) => m.color === side && m.san.endsWith('#'));
      return turn.bestWin >= WIN_SHARE && (mates || net >= MIN_GAIN) && !canSidestep(theme.tactic);
    }
  }
}

/** Players at the level really play the tempting move, it is not a queen simply put en prise, and it costs a piece or mate. */
function isTempting(turn: Turn, theme: Theme): boolean {
  const lure = theme.bait?.move;
  const t = theme.tactic;
  if (!lure || !t) return false;
  const share = turn.human.find((h) => h.uci === lure.from + lure.to + (lure.promotion ?? ''))?.share ?? 0;
  const queenHung = lure.piece === 'q' && t.won?.square === lure.to && t.key === 0;
  const costly = t.id === 'checkmate' || (t.won !== null && VALUE[t.won.type] >= VALUE.n);
  return share >= LURE_SHARE && !queenHung && costly;
}

/** The piece to be won can take the piece that would win it, losing nothing, so the opponent just trades it off. */
export function canSidestep(t: Tactic | null): boolean {
  if (!t?.won || t.key <= t.at) return false;
  const after = new Chess(t.moves[t.at].after);
  const target = pieceOn(after, t.won.square);
  const hunter = pieceOn(after, t.moves[t.key].from);
  if (!target || target.color === t.side || hunter?.color !== t.side) return false;
  const takes = after.moves({ square: target.square, verbose: true }).some((m) => m.to === hunter.square);
  return takes && VALUE[hunter.type] >= VALUE[target.type];
}

/** Another analysed move comes within the clear margin of the best. */
function isContested(turn: Turn): boolean {
  const [, second] = Object.values(turn.grades).sort((a, b) => a - b);
  return second !== undefined && second < CLEAR_MARGIN;
}

const MATE_THREAT_TIER = 9;
const FREE_PIECE_TIERS = { undefended: 0, cheaper: 0, outnumbered: 1 };

/** Lower first: mate in one, then mate in two, then a mate threat; an unguarded or bigger piece before a counted one. */
function tierOf(theme: Theme): number {
  const t = theme.tactic;
  if (theme.id === 'checkmate' && t) return Math.ceil(t.key / 2);
  if (theme.id === 'mate-threat') return MATE_THREAT_TIER;
  if (theme.id === 'free-piece' && t?.id === 'free-piece') return FREE_PIECE_TIERS[t.reason];
  return 0;
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

/** Each position, game and picture once, in order. */
function varied(candidates: Candidate[]): Candidate[] {
  const seen = new Set<string>();
  return candidates.filter((c) => {
    const keys = [c.position, c.ref.gameId, c.picture];
    if (keys.some((key) => seen.has(key))) return false;
    keys.forEach((key) => seen.add(key));
    return true;
  });
}

const textbookFirst = (a: Candidate, b: Candidate) => a.tier - b.tier || Number(a.contested) - Number(b.contested);

/**
 * The sound positions in the order to show them: the clearest first; within a clarity the set's own pool before
 * the other levels, each textbook cases with a clear answer first, then nearest level, then easiest. `pools` hold one unit's candidates.
 * A plan position whose example text would not hold is left to practice.
 */
export function rankExamples(pools: Candidate[][]): Candidate[] {
  const sound = pools.map((pool) => pool.filter((c) => c.sound && c.textbook !== false).sort(easiestFirst));
  const clarities = [...new Set(sound.flat().map((c) => c.clarity))].sort((a, b) => b - a);
  return clarities.flatMap((clarity) => {
    const [own = [], ...others] = sound.map((pool) => pool.filter((c) => c.clarity === clarity));
    return [...own.sort(textbookFirst), ...others.flat().sort(textbookFirst)];
  });
}

/**
 * Up to three worked examples among the clearest sound positions. The first is the best ranked one that is not
 * `overused`, falling back to a less clear one; only when every one is overused does it repeat one.
 */
export function pickExamples(pools: Candidate[][], overused: (position: string) => boolean = () => false): Candidate[] {
  const ranked = rankExamples(pools);
  const first = ranked.find((c) => !overused(c.position)) ?? ranked[0];
  if (!first) return [];
  const clearest = ranked.filter((c) => c.clarity === ranked[0].clarity && c !== first);
  return varied([first, ...clearest]).slice(0, MAX_EXAMPLES);
}

/**
 * Up to sixteen sound practice positions spread over the range of difficulty, never an example's position.
 * The set's own positions come first; other levels only fill the gap, nearest first.
 */
export function pickDrills(pools: Candidate[][], examples: Candidate[]): Candidate[] {
  const taken = new Set(examples.map((c) => c.position));
  const drills: Candidate[] = [];
  for (const pool of pools) {
    const sound = pool.filter((c) => c.sound).sort(easiestFirst);
    const fresh = uniquePositions(sound, new Set(taken));
    const picked = spread(fresh, MAX_DRILLS - drills.length);
    picked.forEach((c) => taken.add(c.position));
    drills.push(...picked);
  }
  return drills;
}

/** How many levels of an opening may open a unit with the same worked example. */
const MAX_SHARED_FIRST = 2;

/** The set's candidates for a unit, one pool per level: its own first, then the nearest. */
function unitPools(set: string, unit: LessonId, candidates: ReadonlyMap<string, Candidate[]>): Candidate[][] {
  const { opening, level } = setOf(set)!;
  return levelsByDistance(level).map((l) => (candidates.get(`${opening}-${l}`) ?? []).filter((c) => c.unit === unit));
}

const refsOf = (cs: Candidate[]) => cs.map((c) => c.ref);

/**
 * The entry for a unit of each set that has an example. Sets whose best example is their own choose first,
 * so a set keeps its own position when others would borrow it too.
 */
function unitEntries(unit: LessonId, sets: string[], candidates: ReadonlyMap<string, Candidate[]>): Map<string, UnitEntry> {
  const pools = new Map(sets.map((set) => [set, unitPools(set, unit, candidates)]));
  const ownsBest = (set: string) => rankExamples(pools.get(set)!)[0]?.ref.set === set;
  const order = [...sets].sort((a, b) => Number(ownsBest(b)) - Number(ownsBest(a)));
  const firsts = new Map<string, number>();
  const overused = (position: string) => (firsts.get(position) ?? 0) >= MAX_SHARED_FIRST;
  const entries = new Map<string, UnitEntry>();
  for (const set of order) {
    const examples = pickExamples(pools.get(set)!, overused);
    if (!examples.length) continue;
    firsts.set(examples[0].position, (firsts.get(examples[0].position) ?? 0) + 1);
    entries.set(set, { id: unit, examples: refsOf(examples), drills: refsOf(pickDrills(pools.get(set)!, examples)) });
  }
  return entries;
}

function emptyCourse(set: string): CourseFile {
  const parsed = setOf(set);
  if (!parsed) throw new Error(`Not a set name: ${set}`);
  return { v: 1, ...parsed, units: [] };
}

const isTrapLesson = (id: LessonId) => isOpeningLessonId(id) && OPENING_LESSONS[id].kind === 'traps';

/** Each set's entry for a lesson: a trap lesson's from the analysed traps, any other's from the candidates. */
function lessonEntries(lesson: LessonId, opening: OpeningId, sets: string[], candidates: ReadonlyMap<string, Candidate[]>, traps: TrapGame[]) {
  if (!isTrapLesson(lesson)) return unitEntries(lesson, sets, candidates);
  const entries = new Map<string, UnitEntry>();
  for (const set of sets) {
    const entry = trapEntry(set, opening, traps);
    if (entry) entries.set(set, entry);
  }
  return entries;
}

/**
 * Every set's course, keyed by set name, from the candidates of every set and the analysed traps. The levels of an
 * opening are built together, each lesson at a time, so they borrow from each other but share a first example at most twice.
 */
export function buildCourses(candidates: ReadonlyMap<string, Candidate[]>, traps: TrapGame[] = []): Map<string, CourseFile> {
  const courses = new Map([...candidates.keys()].map((set) => [set, emptyCourse(set)]));
  for (const { id: opening } of OPENINGS) {
    const sets = [...courses].filter(([, course]) => course.opening === opening).map(([set]) => set);
    for (const lesson of [...UNIT_IDS, ...OPENING_LESSON_IDS[opening]]) {
      for (const [set, entry] of lessonEntries(lesson, opening, sets, candidates, traps)) courses.get(set)!.units.push(entry);
    }
  }
  return courses;
}

/** A lesson position with its game loaded. */
export interface LessonPosition {
  ref: PositionRef;
  game: Game;
  /** Index into `game.turns` of the position. */
  turnIndex: number;
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

export function deviceSource(opening: OpeningId, unit: LessonId): PositionSource {
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

/** Up to `count` of these practice positions that load: from games not played or practised yet and not answered in this unit, else from ones seen before. */
export function pickPractice(refs: PositionRef[], count: number, source: PositionSource): Promise<LessonPosition[]> {
  return firstLoaded(practiceOrder(refs, source.seen), count, source.load);
}

/** The unit's worked example: the first candidate that loads. */
export async function pickExample(entry: UnitEntry, source: PositionSource): Promise<LessonPosition | null> {
  const [example] = await firstLoaded(entry.examples, 1, source.load);
  return example ?? null;
}

