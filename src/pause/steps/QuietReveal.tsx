import type { ResultLine } from '../copy';
import { ResultRow } from './ResultRow';

export interface QuietRevealProps {
  result: ResultLine;
  text: string;
}

/** The reveal for a quiet position: nothing to find, so play on. */
export function QuietReveal({ result, text }: QuietRevealProps) {
  return (
    <div class="pause-quiet">
      <ResultRow result={result} />
      <h2 class="pause-title">{text}</h2>
    </div>
  );
}
