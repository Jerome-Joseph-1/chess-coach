import { LEVELS, OPENINGS } from '../content/catalog';
import { UNIT_IDS, type DrillResult, type LessonPlace, type LessonRecord, type Lessons, type UnitId } from '../course/types';
import type { AskedMoment, Depth, GameSummary, Kind, Level, MomentResult, OpeningId, ReviewItem, Settings, StepOutcome, UnfinishedGame } from '../content/types';
import { DEPTHS, type DepthState, type WindowEntry } from './depth';
import { BOXES } from './srs';
import { isRecord } from './storage';

export const SETTINGS_VERSION = 1;
export const PROGRESS_VERSION = 1;
export const MOMENT_CAP = 5000;
export const GAME_CAP = 2000;
export const DAYS_CAP = 400;

/** Settings plus the manual practice depth; undefined means Auto. */
export type StoredSettings = Settings & { depthOverride?: Depth };

export interface StoredReview extends ReviewItem {
  type: MomentResult['type'];
}

export interface PlayedGame {
  opening: OpeningId;
  level: Level;
  gameId: string;
  at: number;
}

export interface Progress {
  v: number;
  moments: MomentResult[];
  games: PlayedGame[];
  /** Depth state per set, keyed like "italian-1400". */
  depth: Record<string, DepthState>;
  reviews: StoredReview[];
  /** Active days, YYYY-MM-DD, ascending. */
  days: string[];
  /** The welcome-back bonus is waiting for the next recorded game. */
  armed: boolean;
  lastGame: LastGame | null;
  /** Course lessons per opening. */
  lessons: Partial<Record<OpeningId, Lessons>>;
  /** How many times each opening note has been shown in full, by note id. */
  notesSeen: Record<string, number>;
  /** The game of each opening the user left before its end. */
  unfinished: Partial<Record<OpeningId, UnfinishedGame>>;
}

export interface LastGame {
  summary: GameSummary;
  bonus: boolean;
  /** The stage this game unlocked, until the player has seen it. */
  unlocked?: Depth;
}

export const DEFAULT_SETTINGS: StoredSettings = {
  theme: 'system',
  board: 'green',
  sound: true,
  haptics: true,
  quick: false,
  everyNote: false,
  levels: { italian: 1400, 'caro-kann': 1400 },
};

export function emptyProgress(): Progress {
  return {
    v: PROGRESS_VERSION,
    moments: [],
    games: [],
    depth: {},
    reviews: [],
    days: [],
    armed: false,
    lastGame: null,
    lessons: {},
    notesSeen: {},
    unfinished: {},
  };
}

const THEMES: Settings['theme'][] = ['system', 'light', 'dark'];
const BOARDS: Settings['board'][] = ['green', 'brown', 'gray'];
const MOMENT_TYPES: MomentResult['type'][] = ['pause', 'nothing', 'silent'];
const ASKED_TYPES: AskedMoment['type'][] = ['pause', 'nothing'];
const KINDS: Kind[] = ['win', 'defend', 'trap'];
const STEPS: StepOutcome['step'][] = ['spot', 'find', 'solve', 'hold'];
const OPENING_IDS = OPENINGS.map((o) => o.id);
const DAY_FORMAT = /^\d{4}-\d{2}-\d{2}$/;
const SET_KEY_FORMAT = /^[a-z-]+-\d{4}$/;

function pick<T>(options: readonly T[], value: unknown, fallback: T): T {
  return options.find((o) => o === value) ?? fallback;
}

function flag(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

function isNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function list<T>(raw: unknown, parse: (item: unknown) => T | null): T[] {
  if (!Array.isArray(raw)) return [];
  return raw.map(parse).filter((item): item is T => item !== null);
}

export function readSettings(raw: unknown): StoredSettings {
  const r = isRecord(raw) ? raw : {};
  const levels = isRecord(r.levels) ? r.levels : {};
  const d = DEFAULT_SETTINGS;
  const settings: StoredSettings = {
    theme: pick(THEMES, r.theme, d.theme),
    board: pick(BOARDS, r.board, d.board),
    sound: flag(r.sound, d.sound),
    haptics: flag(r.haptics, d.haptics),
    quick: flag(r.quick, d.quick),
    everyNote: flag(r.everyNote, d.everyNote),
    levels: {
      italian: pick(LEVELS, levels.italian, d.levels.italian),
      'caro-kann': pick(LEVELS, levels['caro-kann'], d.levels['caro-kann']),
    },
  };
  const depthOverride = pick<Depth | undefined>(DEPTHS, r.depthOverride, undefined);
  if (depthOverride) settings.depthOverride = depthOverride;
  return settings;
}

function parseOutcome(raw: unknown): StepOutcome | null {
  if (!isRecord(raw) || typeof raw.correct !== 'boolean') return null;
  const step = pick<StepOutcome['step'] | undefined>(STEPS, raw.step, undefined);
  return step ? { step, correct: raw.correct } : null;
}

function parseKind(raw: unknown): Kind | null {
  return pick<Kind | null>(KINDS, raw, null);
}

function parseSet(raw: Record<string, unknown>): { opening: OpeningId; level: Level } | null {
  const opening = pick<OpeningId | undefined>(OPENING_IDS, raw.opening, undefined);
  const level = pick<Level | undefined>(LEVELS, raw.level, undefined);
  return opening && level ? { opening, level } : null;
}

function parseMoment(raw: unknown): MomentResult | null {
  if (!isRecord(raw)) return null;
  const set = parseSet(raw);
  const type = pick<MomentResult['type'] | undefined>(MOMENT_TYPES, raw.type, undefined);
  const depth = pick<Depth | undefined>(DEPTHS, raw.depth, undefined);
  const { gameId, ply, moveNo, stars, at } = raw;
  if (!set || !type || !depth) return null;
  if (typeof gameId !== 'string' || !isNumber(ply) || !isNumber(moveNo) || !isNumber(stars) || !isNumber(at)) return null;
  const moment: MomentResult = {
    ...set,
    gameId,
    ply,
    moveNo,
    type,
    kinds: list(raw.kinds, parseKind),
    depth,
    outcomes: list(raw.outcomes, parseOutcome),
    stars,
    at,
  };
  if (raw.review === true) moment.review = true;
  if (raw.practice === true) moment.practice = true;
  if (raw.hinted === true) moment.hinted = true;
  return moment;
}

function parseSummary(raw: unknown): GameSummary | null {
  if (!isRecord(raw)) return null;
  const set = parseSet(raw);
  if (!set || typeof raw.gameId !== 'string' || !isNumber(raw.at)) return null;
  return { ...set, gameId: raw.gameId, moments: list(raw.moments, parseMoment), at: raw.at };
}

function parseLastGame(raw: unknown): LastGame | null {
  if (!isRecord(raw)) return null;
  const summary = parseSummary(raw.summary);
  if (!summary) return null;
  const lastGame: LastGame = { summary, bonus: raw.bonus === true };
  const unlocked = pick<Depth | undefined>(DEPTHS, raw.unlocked, undefined);
  if (unlocked) lastGame.unlocked = unlocked;
  return lastGame;
}

function parsePlayedGame(raw: unknown): PlayedGame | null {
  if (!isRecord(raw)) return null;
  const set = parseSet(raw);
  if (!set || typeof raw.gameId !== 'string' || !isNumber(raw.at)) return null;
  return { ...set, gameId: raw.gameId, at: raw.at };
}

function parseReview(raw: unknown): StoredReview | null {
  if (!isRecord(raw)) return null;
  const set = parseSet(raw);
  const type = pick<MomentResult['type'] | undefined>(MOMENT_TYPES, raw.type, undefined);
  const { gameId, ply, box, due } = raw;
  if (!set || !type || typeof gameId !== 'string' || !isNumber(ply) || !isNumber(due)) return null;
  if (!isNumber(box) || !BOXES[box]) return null;
  const review: StoredReview = { ...set, gameId, ply, box, due, type };
  if (typeof raw.drillSet === 'string' && SET_KEY_FORMAT.test(raw.drillSet)) review.drillSet = raw.drillSet;
  return review;
}

function parseWindowEntry(raw: unknown): WindowEntry | null {
  if (!isRecord(raw) || typeof raw.key !== 'string' || typeof raw.held !== 'boolean') return null;
  return { key: raw.key, held: raw.held };
}

function parseDepthState(raw: unknown): DepthState | null {
  if (!isRecord(raw)) return null;
  const depth = pick<Depth | undefined>(DEPTHS, raw.depth, undefined);
  return depth ? { depth, window: list(raw.window, parseWindowEntry) } : null;
}

function parseDepthMap(raw: unknown): Progress['depth'] {
  const result: Progress['depth'] = {};
  if (!isRecord(raw)) return result;
  for (const [key, value] of Object.entries(raw)) {
    const state = SET_KEY_FORMAT.test(key) ? parseDepthState(value) : null;
    if (state) result[key] = state;
  }
  return result;
}

function parseDrill(raw: unknown): DrillResult | null {
  if (!isRecord(raw) || typeof raw.key !== 'string' || typeof raw.correct !== 'boolean' || !isNumber(raw.at)) return null;
  return { key: raw.key, correct: raw.correct, at: raw.at };
}

function parsePlace(raw: unknown): LessonPlace | null {
  if (!isRecord(raw)) return null;
  if (raw.page === 'example') return { page: 'example' };
  if (raw.page !== 'practice' || !isNumber(raw.since)) return null;
  return { page: 'practice', since: raw.since, drills: list(raw.drills, (key) => (typeof key === 'string' ? key : null)) };
}

function parseLesson(raw: unknown): LessonRecord | null {
  if (!isRecord(raw)) return null;
  const lesson: LessonRecord = { drills: list(raw.drills, parseDrill) };
  if (isNumber(raw.learnedAt)) lesson.learnedAt = raw.learnedAt;
  if (isNumber(raw.doneAt)) lesson.doneAt = raw.doneAt;
  const place = parsePlace(raw.place);
  if (place) lesson.place = place;
  return lesson;
}

function parseLessons(raw: unknown): Lessons {
  const lessons: Lessons = {};
  if (!isRecord(raw)) return lessons;
  for (const id of UNIT_IDS) {
    const lesson = parseLesson(raw[id]);
    if (lesson) lessons[id as UnitId] = lesson;
  }
  return lessons;
}

function parseLessonsByOpening(raw: unknown): Progress['lessons'] {
  const result: Progress['lessons'] = {};
  if (!isRecord(raw)) return result;
  for (const opening of OPENING_IDS) if (isRecord(raw[opening])) result[opening] = parseLessons(raw[opening]);
  return result;
}

function parsePly(raw: unknown): number | null {
  return typeof raw === 'number' && Number.isInteger(raw) && raw >= 0 ? raw : null;
}

function parseAsked(raw: unknown): AskedMoment | null {
  if (!isRecord(raw)) return null;
  const ply = parsePly(raw.ply);
  const type = pick<AskedMoment['type'] | undefined>(ASKED_TYPES, raw.type, undefined);
  return ply !== null && type ? { ply, type } : null;
}

function parseUnfinished(raw: unknown): UnfinishedGame | null {
  if (!isRecord(raw)) return null;
  const level = pick<Level | undefined>(LEVELS, raw.level, undefined);
  const ply = parsePly(raw.ply);
  if (!level || typeof raw.gameId !== 'string' || ply === null) return null;
  return {
    level,
    gameId: raw.gameId,
    ply,
    moments: list(raw.moments, parseAsked),
    results: list(raw.results, parseMoment),
    quiet: list(raw.quiet, parsePly),
    noteStops: parsePly(raw.noteStops) ?? 0,
  };
}

function parseUnfinishedByOpening(raw: unknown): Progress['unfinished'] {
  const result: Progress['unfinished'] = {};
  if (!isRecord(raw)) return result;
  for (const opening of OPENING_IDS) {
    const game = parseUnfinished(raw[opening]);
    if (game) result[opening] = game;
  }
  return result;
}

function parseCounts(raw: unknown): Record<string, number> {
  const counts: Record<string, number> = {};
  if (!isRecord(raw)) return counts;
  for (const [key, value] of Object.entries(raw)) if (isNumber(value)) counts[key] = value;
  return counts;
}

function parseDay(raw: unknown): string | null {
  return typeof raw === 'string' && DAY_FORMAT.test(raw) ? raw : null;
}

/** Validates stored or imported progress, dropping anything malformed; null when it is not progress at all. */
export function readProgress(raw: Record<string, unknown> | null): Progress | null {
  if (!raw) return null;
  return {
    v: PROGRESS_VERSION,
    moments: list(raw.moments, parseMoment).slice(-MOMENT_CAP),
    games: list(raw.games, parsePlayedGame).slice(-GAME_CAP),
    depth: parseDepthMap(raw.depth),
    reviews: list(raw.reviews, parseReview),
    days: [...new Set(list(raw.days, parseDay))].sort().slice(-DAYS_CAP),
    armed: raw.armed === true,
    lastGame: parseLastGame(raw.lastGame),
    lessons: parseLessonsByOpening(raw.lessons),
    notesSeen: parseCounts(raw.notesSeen),
    unfinished: parseUnfinishedByOpening(raw.unfinished),
  };
}
