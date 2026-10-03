import type { Level, OpeningId } from '../content/types';

export interface GameProps {
  opening: OpeningId;
  level: Level;
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
