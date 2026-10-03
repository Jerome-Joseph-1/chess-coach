import { Button } from '../../ui/Button';
import { CheckPop } from '../../ui/CheckPop';
import { COPY } from '../copy';

export interface QuietRevealProps {
  text: string;
  /** The user was right that nothing special is going on. */
  right: boolean;
  onContinue: () => void;
}

/** The reveal for a quiet position: nothing to find, so play on. */
export function QuietReveal({ text, right, onContinue }: QuietRevealProps) {
  return (
    <div class="pause-quiet">
      <div class="pause-quiet-head">
        {right && <CheckPop />}
        <h2 class="pause-title">{text}</h2>
      </div>
      <Button variant="primary" size="lg" onClick={onContinue}>
        {COPY.next}
      </Button>
    </div>
  );
}
