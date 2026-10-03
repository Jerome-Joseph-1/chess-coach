import { Button } from '../../ui/Button';
import { COPY } from '../copy';
import { CheckIcon } from './icons';

export interface QuietChip {
  san: string;
  /** Whole percent of players at this level who choose the move. */
  percent: number;
}

export interface QuietRevealProps {
  headline: string;
  level: number;
  chips: QuietChip[];
  onContinue: () => void;
}

/** The reveal for a position with nothing to find: how many fine moves there are, then play on. */
export function QuietReveal({ headline, level, chips, onContinue }: QuietRevealProps) {
  return (
    <div class="pause-quiet">
      <div class="pause-quiet-head">
        <span class="pause-badge is-good is-inline">
          <CheckIcon />
        </span>
        <h2 class="pause-headline">{headline}</h2>
      </div>
      <p class="pause-help">Most common moves at {level}:</p>
      <div class="pause-chips">
        {chips.map((chip) => (
          <span key={chip.san} class="pause-chip">
            <b>{chip.san}</b>
            {chip.percent}%
          </span>
        ))}
      </div>
      <Button variant="primary" size="lg" onClick={onContinue}>
        {COPY.next}
      </Button>
    </div>
  );
}
