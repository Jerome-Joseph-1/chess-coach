import { setKey } from '../content/loader';
import type { DrillResult, LessonRecord, Lessons, UnitId } from '../course/types';
import type { Depth, GameSummary, Level, MomentResult, OpeningId, ReviewItem } from '../content/types';
import { createBackup, parseBackup } from './backup';
import { dayKey, daysBetween } from './days';
import { applyMoment, newDepthState } from './depth';
import {
  DAYS_CAP,
  GAME_CAP,
  MOMENT_CAP,
  PROGRESS_VERSION,
  SETTINGS_VERSION,
  emptyProgress,
  readProgress,
  readSettings,
  type Progress,
  type StoredSettings,
} from './model';
import { dueItems, updateDrillReviews, updateReviews, type DrillSpot } from './srs';
import { setStats, stageProgress, weekStats, type RateCount, type SetStats, type WeekStats } from './stats';
import { KEYS, isRecord, migrate, readJson, removeKey, writeJson } from './storage';

export type { StoredSettings } from './model';

const WELCOME_GAP_DAYS = 2;

// Loaded once and kept here, so a browser that refuses to store still works for the session.
let settings: StoredSettings | null = null;
let progress: Progress | null = null;
// A stage reached during the current game; recordGame hands it to the recap.
let reachedStage: Depth | null = null;

export function getSettings(): StoredSettings {
  settings ??= readSettings(migrate(readJson(KEYS.settings), SETTINGS_VERSION));
  return settings;
}

function persistSettings(): void {
  writeJson(KEYS.settings, { v: SETTINGS_VERSION, ...getSettings() });
}

export function saveSettings(next: StoredSettings): void {
  settings = readSettings(next);
  persistSettings();
}

function state(): Progress {
  progress ??= readProgress(migrate(readJson(KEYS.progress), PROGRESS_VERSION)) ?? emptyProgress();
  return progress;
}

function persist(): void {
  writeJson(KEYS.progress, state());
}

export function getDepth(opening: OpeningId, level: Level): Depth {
  return getSettings().depthOverride ?? state().depth[setKey(opening, level)]?.depth ?? 1;
}

function trackDepth(p: Progress, r: MomentResult): Depth | undefined {
  if (getSettings().depthOverride) return undefined;
  const key = setKey(r.opening, r.level);
  const result = applyMoment(p.depth[key] ?? newDepthState(), r);
  p.depth[key] = result.state;
  return result.changed;
}

// Coming back after a gap arms the bonus; the next recorded game spends it.
function touchDay(p: Progress, at: number): void {
  const today = dayKey(at);
  if (p.days.includes(today)) return;
  const last = p.days.at(-1);
  if (last && daysBetween(last, today) >= WELCOME_GAP_DAYS) p.armed = true;
  p.days = [...p.days, today].sort().slice(-DAYS_CAP);
}

export function welcomeBack(now: number): boolean {
  const p = state();
  const last = p.days.at(-1);
  return p.armed || (last !== undefined && daysBetween(last, dayKey(now)) >= WELCOME_GAP_DAYS);
}

/** Records a moment and returns the new depth when it changed. */
export function recordMoment(r: MomentResult): { depthChanged?: Depth } {
  const p = state();
  touchDay(p, r.at);
  p.moments.push(r);
  if (p.moments.length > MOMENT_CAP) p.moments.splice(0, p.moments.length - MOMENT_CAP);
  if (!r.practice) p.reviews = updateReviews(p.reviews, r);
  const depthChanged = r.practice ? undefined : trackDepth(p, r);
  if (depthChanged) reachedStage = depthChanged > r.depth ? depthChanged : null;
  persist();
  return depthChanged ? { depthChanged } : {};
}

function requestPersistentStorage(): void {
  try {
    void navigator.storage?.persist?.();
  } catch {
    // best effort: the browser decides
  }
}

export function recordGame(summary: GameSummary): void {
  const p = state();
  touchDay(p, summary.at);
  const bonus = p.armed;
  p.armed = false;
  p.games.push({ opening: summary.opening, level: summary.level, gameId: summary.gameId, at: summary.at });
  if (p.games.length > GAME_CAP) p.games.splice(0, p.games.length - GAME_CAP);
  p.lastGame = { summary, bonus };
  if (reachedStage) p.lastGame.unlocked = reachedStage;
  reachedStage = null;
  persist();
  if (p.games.length === 1) requestPersistentStorage();
}

export function getLastGame(): GameSummary | null {
  return state().lastGame?.summary ?? null;
}

/** The last recorded game was played with the welcome-back bonus. */
export function getLastGameBonus(): boolean {
  return state().lastGame?.bonus ?? false;
}

/** The stage the last game unlocked, if the player has not seen it yet. */
export function getLastGameUnlock(): Depth | null {
  return state().lastGame?.unlocked ?? null;
}

export function clearLastGameUnlock(): void {
  const { lastGame } = state();
  if (!lastGame?.unlocked) return;
  delete lastGame.unlocked;
  persist();
}

/** Games played in full, plus games a lesson used for practice: neither is offered as a new game. */
export function playedGameIds(opening: OpeningId, level: Level): string[] {
  const ids = state().games.filter((g) => g.opening === opening && g.level === level).map((g) => g.gameId);
  return [...new Set([...ids, ...drilledGameIds(setKey(opening, level))])];
}

function drilledGameIds(set: string): string[] {
  const lessons = Object.values(state().lessons).flatMap((byUnit) => Object.values(byUnit ?? {}));
  const prefix = `${set}/`;
  return lessons.flatMap((l) => l.drills.filter((d) => d.key.startsWith(prefix)).map((d) => d.key.slice(prefix.length).split(':')[0]));
}

/** Games of this opening played since `at`, at any level. */
export function gamesPlayedSince(opening: OpeningId, at: number): number {
  return state().games.filter((g) => g.opening === opening && g.at > at).length;
}

export function dropReview(opening: OpeningId, level: Level, gameId: string, ply: number): void {
  const p = state();
  p.reviews = p.reviews.filter((r) => r.drillSet || !(r.opening === opening && r.level === level && r.gameId === gameId && r.ply === ply));
  persist();
}

/** Schedules a lesson's practice position by its answer: a miss or a hinted find comes back, a right answer moves it on. */
export function scheduleDrill(drill: DrillSpot, right: boolean, at: number): void {
  const p = state();
  p.reviews = updateDrillReviews(p.reviews, drill, right, at);
  persist();
}

/** Takes a practice position that is no longer in the course off the review list. */
export function dropDrillReview(drillSet: string, gameId: string, ply: number): void {
  const p = state();
  p.reviews = p.reviews.filter((r) => !(r.drillSet === drillSet && r.gameId === gameId && r.ply === ply));
  persist();
}

export function getLessons(opening: OpeningId): Lessons {
  return state().lessons[opening] ?? {};
}

function lessonRecord(opening: OpeningId, unit: UnitId): LessonRecord {
  const p = state();
  const byUnit = (p.lessons[opening] ??= {});
  return (byUnit[unit] ??= { drills: [] });
}

export function recordLearned(opening: OpeningId, unit: UnitId, at: number): void {
  lessonRecord(opening, unit).learnedAt ??= at;
  persist();
}

export function recordDrill(opening: OpeningId, unit: UnitId, result: DrillResult): void {
  lessonRecord(opening, unit).drills.push(result);
  persist();
}

export function recordLessonDone(opening: OpeningId, unit: UnitId, at: number): void {
  lessonRecord(opening, unit).doneAt = at;
  persist();
}

export function noteSeenCount(id: string): number {
  return state().notesSeen[id] ?? 0;
}

export function markNoteSeen(id: string): void {
  const p = state();
  p.notesSeen[id] = (p.notesSeen[id] ?? 0) + 1;
  persist();
}

export function dueReviews(opening: OpeningId, level: Level, now: number): ReviewItem[] {
  const p = state();
  return dueItems(p.reviews, p.moments, opening, level, now);
}

export function getSetStats(opening: OpeningId, level: Level): SetStats {
  const p = state();
  return setStats(p.moments, p.games, opening, level);
}

export function getWeekStats(now: number): WeekStats {
  return weekStats(state().moments, now);
}

/** Every recorded answer, oldest first; replays included, so filter before counting. */
export function getMoments(): readonly MomentResult[] {
  return state().moments;
}

/** How close the set is to its next stage; null when the stage is chosen by hand in Settings. */
export function getStageProgress(opening: OpeningId, level: Level): RateCount | null {
  if (getSettings().depthOverride) return null;
  return stageProgress(state().depth[setKey(opening, level)]?.window ?? []);
}

export function getActiveDays(): Set<string> {
  return new Set(state().days);
}

export function hasPlayed(): boolean {
  return state().games.length > 0;
}

export function exportProgress(now = Date.now()): string {
  return JSON.stringify(createBackup(getSettings(), state(), now), null, 2);
}

export function importProgress(text: string): { ok: true } | { ok: false; error: string } {
  const result = parseBackup(text);
  if (!result.ok) return result;
  settings = result.settings;
  progress = result.progress;
  persistSettings();
  persist();
  return { ok: true };
}

export function resetProgress(): void {
  progress = emptyProgress();
  reachedStage = null;
  removeKey(KEYS.progress);
}

export function isInstallHintDismissed(): boolean {
  const ui = readJson(KEYS.ui);
  return isRecord(ui) && ui.installHintDismissed === true;
}

export function dismissInstallHint(): void {
  const ui = readJson(KEYS.ui);
  writeJson(KEYS.ui, { ...(isRecord(ui) ? ui : {}), v: 1, installHintDismissed: true });
}
