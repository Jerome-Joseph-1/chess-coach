import type { Depth, Level, OpeningId } from '../../content/types';
import { navigate } from '../../router';
import { Button } from '../../ui/Button';
import { disabledIf } from '../shared/disabledIf';
import { OPENING_TITLES, playPath, ratingLine, sideLine } from '../shared/labels';
import { StageLine } from '../shared/StageLine';
import { nextGameParts } from './nextGame';
import { OfflineRow } from './OfflineRow';
import type { NextGameState } from './useNextGame';

interface OpeningCardProps {
  opening: OpeningId;
  level: Level;
  stage: Depth;
  quick: boolean;
  game: NextGameState;
}

function NextGameRow({ game, stage, quick }: { game: NextGameState; stage: Depth; quick: boolean }) {
  if (game.status === 'soon') return null;
  if (game.status === 'error') return <p class="next-game">Can't reach the games right now. Check your connection.</p>;
  const parts = game.status === 'ready' ? nextGameParts(game.next, game.positions, stage, quick) : null;
  return (
    <p class="next-game">
      <span class="muted">Next game</span>
      <strong>{parts?.what}</strong>
      <span class="muted next-game-time">{parts?.time}</span>
    </p>
  );
}

/** The opening you would play next: where you are in it, what comes up, and the one button to start. */
export function OpeningCard({ opening, level, stage, quick, game }: OpeningCardProps) {
  const ready = game.status === 'ready';
  return (
    <>
      <section class="card opening-card" aria-labelledby="opening-card-title">
        <div>
          <h2 id="opening-card-title" class="opening-title">
            {OPENING_TITLES[opening]}
          </h2>
          <p class="muted">
            {sideLine(opening)} · {ratingLine(level)}
          </p>
        </div>
        <StageLine depth={stage} />
        <NextGameRow game={game} stage={stage} quick={quick} />
        <OfflineRow opening={opening} level={level} disabled={!ready} />
      </section>
      <Button size="lg" {...disabledIf(!ready)} onClick={() => navigate(playPath(opening, level))}>
        {game.status === 'soon' ? 'Coming soon' : 'Play next game'}
      </Button>
    </>
  );
}
