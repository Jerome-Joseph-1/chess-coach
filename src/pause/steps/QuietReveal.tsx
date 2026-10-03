import type { ResultLine } from '../copy';
import { Remember, ResultBubble } from './Result';

export interface QuietRevealProps {
  result: ResultLine;
  text: string;
  remember: string;
}

/** The answer for a quiet position: nothing to find, so play on. Its eyebrow says quiet, so it needs no pattern chip. */
export function QuietReveal({ result, text, remember }: QuietRevealProps) {
  return (
    <div class="pause-answer">
      <ResultBubble result={result} text={text} />
      <Remember text={remember} />
    </div>
  );
}
