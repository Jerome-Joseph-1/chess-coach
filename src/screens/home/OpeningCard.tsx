import type { Depth, Level, OpeningId } from '../../content/types';
import { navigate } from '../../router';
import { Button } from '../../ui/Button';
import { disabledIf } from '../shared/disabledIf';
import { OPENING_TITLES, playPath, ratingLine, sideLine } from '../shared/labels';
import { StageLine } from '../shared/StageLine';
import { nextGameLine } from './nextGame';
import { OfflineRow } from './OfflineRow';
import type { NextGameState } from './useNextGame';

interface OpeningCardProps {
  opening: OpeningId;
  level: Level;
  stage: Depth;
  quick: boolean;
  game: NextGameState;
}

function InfoRow({ game, stage, quick }: { game: NextGameState; stage: Depth; quick: boolean }) {
  if (game.status === 'ready') {
    return <p class="info-row">{nextGameLine(game.next, game.positions, stage, quick)}</p>;
  }
  if (game.status === 'error') return <p class="info-row">Can't reach the games right now. Check your connection.</p>;
  return null;
}

/** The opening you would play next: where you are in it and the one button to start. */
export function OpeningCard({ opening, level, stage, quick, game }: OpeningCardProps) {
  const ready = game.status === 'ready';
  return (
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
      <InfoRow game={game} stage={stage} quick={quick} />
      <Button size="lg" {...disabledIf(!ready)} onClick={() => navigate(playPath(opening, level))}>
        {game.status === 'soon' ? 'Coming soon' : 'Play next game'}
      </Button>
      <OfflineRow opening={opening} level={level} disabled={!ready} />
    </section>
  );
}
