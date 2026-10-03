import type { OpeningId } from '../content/types';
import { noteSeenCount } from '../progress/store';
import { variationsMet, variationsOf } from '.';
import './variations.css';

/** The variations of this opening the user has met in games, each with its plan. */
export function VariationsMet({ opening }: { opening: OpeningId }) {
  const met = variationsMet(opening, noteSeenCount);
  return (
    <section class="section-block" aria-labelledby="variations-title">
      <div class="section-head">
        <h2 id="variations-title" class="section-label">
          Variations met
        </h2>
        {met.length > 0 && (
          <span class="section-note">
            {met.length} of {variationsOf(opening).length}
          </span>
        )}
      </div>
      {met.length === 0 ? (
        <p class="card variations-empty">Play a few games to meet the main lines.</p>
      ) : (
        <ul class="card list">
          {met.map(({ id, name, plan }, i) => (
            <li key={id} class="row variation rise-in" style={{ '--i': i }}>
              <span class="row-main">
                <span class="row-title">{name}</span>
                <span class="row-sub">{plan}</span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
