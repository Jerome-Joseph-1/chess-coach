import type { PatternLabelProps } from '../Coach';
import type { ResultLine } from '../copy';
import { Remember, ResultBubble } from './Result';

export interface QuietRevealProps {
  result: ResultLine;
  text: string;
  remember: string;
  pattern?: PatternLabelProps;
}

/** The answer for a quiet position: nothing to find, so play on. */
export function QuietReveal({ result, text, remember, pattern }: QuietRevealProps) {
  return (
    <div class="pause-answer">
      <ResultBubble result={result} text={text} pattern={pattern} />
      <Remember text={remember} />
    </div>
  );
}
