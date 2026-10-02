import type { Depth, MomentType, Turn } from '../content/types';

export interface MomentOptions {
  quick?: boolean;
  seed?: number;
}

/** Decide which user turns become pauses, "nothing" pauses, silent checks and play-out moves. Keys are indexes into turns. */
export function chooseMoments(_turns: Turn[], _depth: Depth, _opts: MomentOptions = {}): Map<number, MomentType> {
  return new Map();
}
