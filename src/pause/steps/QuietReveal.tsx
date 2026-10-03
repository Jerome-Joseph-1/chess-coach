import type { ResultLine } from '../copy';
import { Remember, ResultRow } from './ResultRow';

export interface QuietRevealProps {
  result: ResultLine;
  text: string;
  remember: string;
}

/** The reveal for a quiet position: nothing to find, so play on. */
export function QuietReveal({ result, text, remember }: QuietRevealProps) {
  return (
    <div class="pause-quiet">
      <ResultRow result={result} />
      <h2 class="pause-title">{text}</h2>
      <Remember text={remember} />
    </div>
  );
}
