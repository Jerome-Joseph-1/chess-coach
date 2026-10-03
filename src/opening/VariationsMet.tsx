import type { OpeningId } from '../content/types';
import { noteSeenCount } from '../progress/store';
import { variationsMet } from '.';
import './variations.css';

/** The variations of this opening the user has met in games, each with its plan. */
export function VariationsMet({ opening }: { opening: OpeningId }) {
  const met = variationsMet(opening, noteSeenCount);
  return (
    <section class="section-block variations-met">
      <h2 class="section-label">Variations you have met</h2>
      {met.length === 0 ? (
        <p class="card variations-empty">Play a few games to meet the main lines.</p>
      ) : (
        <ul class="card list">
          {met.map(({ id, name, plan }) => (
            <li key={id} class="row variation">
              <div class="row-main">
                <span class="variation-name">{name}</span>
                <span class="row-sub">{plan}</span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
