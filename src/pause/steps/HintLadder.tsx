import { Fragment } from 'preact';
import type { HintLadder as Ladder } from '../hints';

function stopState(i: number, used: number): string {
  if (i < used) return ' is-used';
  return i === used ? ' is-next' : '';
}

/** "Hints: Idea, Piece, Move": a used hint gets a check, the next one a ring in the coach's colour. */
export function HintLadder({ stops, used }: Ladder) {
  const next = stops[used];
  const label = `Hints: ${used} of ${stops.length} used${next ? `, next the ${next.toLowerCase()}` : ''}`;
  return (
    <div class="hint-ladder" role="img" aria-label={label}>
      <span class="hint-lead" aria-hidden="true">
        Hints
      </span>
      <ol aria-hidden="true">
        {stops.map((name, i) => (
          <Fragment key={name}>
            {i > 0 && <li class={`hint-rule${i < used ? ' is-filled' : ''}`} />}
            <li class={`hint-stop${stopState(i, used)}`}>
              <span class="hint-dot">
                <svg viewBox="0 0 14 14" class="hint-check">
                  <path d="M11.4 3.8L5.5 9.6L2.6 6.7" pathLength={1} />
                </svg>
              </span>
              {name}
            </li>
          </Fragment>
        ))}
      </ol>
    </div>
  );
}
