import { LEVELS, OPENINGS } from '../../content/catalog';
import type { Level, OpeningId } from '../../content/types';
import { OPENING_TITLES } from '../shared/labels';
import { Segmented } from '../shared/Segmented';

const LEVEL_OPTIONS = LEVELS.map((value) => ({ value, label: String(value) }));

interface OpponentRatingsProps {
  levels: Record<OpeningId, Level>;
  onChange: (opening: OpeningId, level: Level) => void;
}

/** How strong the opponents are, one choice per opening. */
export function OpponentRatings({ levels, onChange }: OpponentRatingsProps) {
  return (
    <section class="section-block" aria-labelledby="opponents-title">
      <h2 id="opponents-title" class="section-label">
        Opponents
      </h2>
      <ul class="card list">
        {OPENINGS.map(({ id }) => (
          <li key={id} class="row row-stack">
            <span>{OPENING_TITLES[id]}</span>
            <Segmented label={`${OPENING_TITLES[id]} opponents`} options={LEVEL_OPTIONS} value={levels[id]} onChange={(level) => onChange(id, level)} />
          </li>
        ))}
      </ul>
      <p class="settings-hint">The rating of the players you face.</p>
    </section>
  );
}
