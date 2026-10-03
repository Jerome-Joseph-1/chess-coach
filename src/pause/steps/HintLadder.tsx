import { Fragment } from 'preact';
import type { HintLadder as Ladder } from '../hints';

/** "Pattern · Piece · Move": the rungs used are filled with a check, the line to the next one fills first. */
export function HintLadder({ stops, used }: Ladder) {
  return (
    <ol class="hint-ladder" aria-label={`${used} of ${stops.length} hints used`}>
      {stops.map((name, i) => (
        <Fragment key={name}>
          {i > 0 && <li class={`hint-rule${i < used ? ' is-filled' : ''}`} aria-hidden="true" />}
          <li class={`hint-stop${i < used ? ' is-used' : i === used ? ' is-next' : ''}`}>
            <span class="hint-dot" aria-hidden="true">
              <span class="hint-num">{i + 1}</span>
              <svg viewBox="0 0 14 14" class="hint-check">
                <path d="M11.4 3.8L5.5 9.6L2.6 6.7" pathLength={1} />
              </svg>
            </span>
            {name}
          </li>
        </Fragment>
      ))}
    </ol>
  );
}
