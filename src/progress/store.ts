import type { Depth, GameSummary, Level, MomentResult, OpeningId, ReviewItem, Settings } from '../content/types';

const DEFAULT_SETTINGS: Settings = {
  theme: 'system',
  sound: true,
  haptics: true,
  quick: false,
  levels: { italian: 1400, 'caro-kann': 1400 },
};

let lastGame: GameSummary | null = null;

export function getSettings(): Settings {
  return DEFAULT_SETTINGS;
}

export function saveSettings(_s: Settings): void {}

export function getDepth(_opening: OpeningId, _level: Level): Depth {
  return 1;
}

/** Records a moment and returns the new depth when it changed. */
export function recordMoment(_r: MomentResult): { depthChanged?: Depth } {
  return {};
}

export function recordGame(summary: GameSummary): void {
  lastGame = summary;
}

export function getLastGame(): GameSummary | null {
  return lastGame;
}

export function playedGameIds(_opening: OpeningId, _level: Level): string[] {
  return [];
}

export function dueReviews(_opening: OpeningId, _level: Level, _now: number): ReviewItem[] {
  return [];
}
