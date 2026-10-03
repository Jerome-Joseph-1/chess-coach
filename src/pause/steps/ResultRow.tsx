import { CheckPop, type MarkTone } from '../../ui/CheckPop';
import type { ResultKind, ResultLine } from '../copy';

const TONES: Record<ResultKind, MarkTone> = { success: 'success', danger: 'danger', quiet: 'muted' };

/** How the attempt went, in the colour of the verdict. Colour never carries it alone: the mark differs too. */
export function ResultRow({ result }: { result: ResultLine }) {
  return (
    <p class={`pause-result is-${result.kind}`}>
      <CheckPop tone={TONES[result.kind]} />
      {result.text}
    </p>
  );
}
