import pieceSprite from 'cm-chessboard/assets/pieces/standard.svg?url';
import { LEVELS, OPENINGS } from '../../content/catalog';
import type { Level, OpeningId } from '../../content/types';
import { percent } from '../../progress/stats';
import { getSetStats } from '../../progress/store';
import { Chevron } from '../shared/icons';
import { OPENING_TITLES, sideLine } from '../shared/labels';
import { Segmented } from '../shared/Segmented';

const LEVEL_OPTIONS = LEVELS.map((value) => ({ value, label: String(value) }));

// The tile shows a piece of the colour you play.
const TILE_PIECE: Record<OpeningId, string> = { italian: 'wb', 'caro-kann': 'bp' };

function PieceTile({ opening }: { opening: OpeningId }) {
  return (
    <span class="piece-tile" aria-hidden="true">
      <svg width="30" height="30" viewBox="0 0 40 40">
        <use href={`${pieceSprite}#${TILE_PIECE[opening]}`} />
      </svg>
    </span>
  );
}

interface OpeningListProps {
  levels: Record<OpeningId, Level>;
  featured: OpeningId;
  onSelect: (opening: OpeningId) => void;
  onLevel: (opening: OpeningId, level: Level) => void;
}

function OpeningItem({ id, level, current, onSelect, onLevel }: { id: OpeningId; level: Level; current: boolean; onSelect: () => void; onLevel: (level: Level) => void }) {
  const stats = getSetStats(id, level);
  const rate = percent(stats.found);
  return (
    <li>
      <button type="button" class="row opening-row" aria-current={current ? 'true' : undefined} onClick={onSelect}>
        <PieceTile opening={id} />
        <span class="row-main">
          <span>{OPENING_TITLES[id]}</span>
          <span class="row-sub">
            {sideLine(id)} · {stats.games} {stats.games === 1 ? 'game' : 'games'}
          </span>
        </span>
        <span class="row-value">{rate === null ? 'Not started' : `${rate}% right`}</span>
        <Chevron />
      </button>
      <div class="opening-level">
        <Segmented label={`${OPENING_TITLES[id]} level`} options={LEVEL_OPTIONS} value={level} onChange={onLevel} />
      </div>
    </li>
  );
}

export function OpeningList({ levels, featured, onSelect, onLevel }: OpeningListProps) {
  return (
    <section id="openings" aria-labelledby="openings-title">
      <h2 id="openings-title" class="section-label">
        Openings
      </h2>
      <ul class="card list">
        {OPENINGS.map((o) => (
          <OpeningItem key={o.id} id={o.id} level={levels[o.id]} current={o.id === featured} onSelect={() => onSelect(o.id)} onLevel={(level) => onLevel(o.id, level)} />
        ))}
      </ul>
    </section>
  );
}
