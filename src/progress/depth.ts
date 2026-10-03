import type { Depth, MomentResult } from '../content/types';
import { holds } from './moments';

export const DEPTHS: Depth[] = [1, 2, 3, 4, 5];

export const DEPTH_NAMES: Record<Depth, string> = {
  1: 'Notice',
  2: 'Point',
  3: 'Play',
  4: 'Follow through',
  5: 'Finish',
};

export const DEPTH_BLURBS: Record<Depth, string> = {
  1: 'Tell us if something important is going on',
  2: 'Tap the piece that matters',
  3: 'Find the best move and play it',
  4: 'Play the next move too',
  5: "Play it out until it's settled",
};

/** What the player does at each stage, worded to follow "Stage 3 of 5:". */
const STAGE_ACTIONS: Record<Depth, string> = {
  1: 'Notice the moment',
  2: 'Point to the piece',
  3: 'Play the move',
  4: 'Follow through',
  5: 'Finish the line',
};

/** How a depth is shown to the player, e.g. "Stage 3 of 5: Play the move". */
export function stageLine(depth: Depth): string {
  return `Stage ${depth} of ${DEPTHS.length}: ${STAGE_ACTIONS[depth]}`;
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
