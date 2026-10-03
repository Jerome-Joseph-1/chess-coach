import type { Level, OpeningId } from '../content/types';

export interface GameProps {
  opening: OpeningId;
  level: Level;
  /** Replay a past pause as a review: the game jumps to just before this ply. */
  review?: { gameId: string; ply: number };
}

export function Game({ opening, level }: GameProps) {
  return (
    <main style={{ padding: 16 }}>
      <h1>
        {opening} · {level}
      </h1>
    </main>
  );
}
