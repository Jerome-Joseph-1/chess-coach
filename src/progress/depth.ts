import type { Depth, MomentResult } from '../content/types';
import { holds } from './moments';

export const DEPTHS: Depth[] = [1, 2, 3, 4, 5];
/** The depths a player can tell apart; 2 and 3 ask the same as 1 and are kept only for old saves. */
export const STAGES: Depth[] = [1, 4, 5];

const SPOT_AND_PLAY = 'Spot it, then play it';

/** What the player does at each stage, worded to follow "Stage 2 of 3:". Depths 1 to 3 all ask one move. */
export const DEPTH_NAMES: Record<Depth, string> = {
  1: SPOT_AND_PLAY,
  2: SPOT_AND_PLAY,
  3: SPOT_AND_PLAY,
  4: 'Play the follow-up too',
  5: 'Play it all the way',
};

export const DEPTH_BLURBS: Record<Depth, string> = {
  1: 'Spot the moment, then play the best move',
  2: 'Spot the moment, then play the best move',
  3: 'Spot the moment, then play the best move',
  4: 'Play the next move too',
  5: "Play it out until it's settled",
};

export function stageOf(depth: Depth): Depth {
  return depth <= 3 ? 1 : depth;
}

/** 1, 2 or 3: where a depth sits among the stages. */
export function stageNumber(depth: Depth): number {
  return STAGES.indexOf(stageOf(depth)) + 1;
}

/** How a depth is shown to the player, e.g. "Stage 2 of 3: Play the follow-up too". */
export function stageLine(depth: Depth): string {
  return `Stage ${stageNumber(depth)} of ${STAGES.length}: ${DEPTH_NAMES[depth]}`;
}

function nextStage(depth: Depth, step: 1 | -1): Depth | undefined {
  return STAGES[stageNumber(depth) - 1 + step];
}

export const WINDOW_SIZE = 20;
export const MOVE_UP_AT = 15;
export const MOVE_DOWN_BELOW = 10;

export interface WindowEntry {
  key: string;
  held: boolean;
}

export interface DepthState {
  depth: Depth;
  /** Latest result per pause at the current depth, oldest first. */
  window: WindowEntry[];
}

export function newDepthState(): DepthState {
  return { depth: 1, window: [] };
}

function moveTo(depth: Depth): { state: DepthState; changed: Depth } {
  return { state: { depth, window: [] }, changed: depth };
}

/** Folds one recorded moment into the set's depth state; `changed` is set when the depth moved. */
export function applyMoment(state: DepthState, m: MomentResult): { state: DepthState; changed?: Depth } {
  if (m.type !== 'pause' || m.practice || m.depth !== state.depth) return { state };
  const entry = { key: `${m.gameId}:${m.ply}`, held: holds(m) };
  const window = [...state.window.filter((e) => e.key !== entry.key), entry].slice(-WINDOW_SIZE);
  if (window.length === WINDOW_SIZE) {
    const held = window.filter((e) => e.held).length;
    const up = nextStage(state.depth, 1);
    const down = nextStage(state.depth, -1);
    if (held >= MOVE_UP_AT && up) return moveTo(up);
    if (held < MOVE_DOWN_BELOW && down) return moveTo(down);
  }
  return { state: { depth: state.depth, window } };
}
