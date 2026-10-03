import type { Depth, MomentResult } from '../content/types';
import { holds } from './moments';

export const DEPTHS: Depth[] = [1, 2, 3, 4, 5];

const SPOT_AND_PLAY = 'Spot it, then play it';

/** What the player does at each stage, worded to follow "Stage 3 of 5:". Stages 1 to 3 all ask one move. */
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

/** How a depth is shown to the player, e.g. "Stage 4 of 5: Play the follow-up too". */
export function stageLine(depth: Depth): string {
  return `Stage ${depth} of ${DEPTHS.length}: ${DEPTH_NAMES[depth]}`;
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
  if (m.type !== 'pause' || m.depth !== state.depth) return { state };
  const entry = { key: `${m.gameId}:${m.ply}`, held: holds(m) };
  const window = [...state.window.filter((e) => e.key !== entry.key), entry].slice(-WINDOW_SIZE);
  if (window.length === WINDOW_SIZE) {
    const held = window.filter((e) => e.held).length;
    if (held >= MOVE_UP_AT && state.depth < 5) return moveTo((state.depth + 1) as Depth);
    if (held < MOVE_DOWN_BELOW && state.depth > 1) return moveTo((state.depth - 1) as Depth);
  }
  return { state: { depth: state.depth, window } };
}
