import type { Depth, MomentResult } from '../content/types';
import { holds } from './moments';

export const DEPTHS: Depth[] = [1, 2, 3, 4, 5];

export const DEPTH_NAMES: Record<Depth, string> = {
  1: 'Spot it',
  2: 'Find it',
  3: 'Solve it',
  4: 'Hold it',
  5: 'Finish it',
};

export const DEPTH_BLURBS: Record<Depth, string> = {
  1: 'The game pauses and asks one thing: is there anything here?',
  2: 'Now you point to where it is on the board.',
  3: 'Now you play the move yourself.',
  4: 'Play the move, then keep finding the follow-ups that hold it together.',
  5: 'Finish the job: play the idea all the way through.',
};

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
