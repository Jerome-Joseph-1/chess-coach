import { CheckPop, type MarkTone } from '../../ui/CheckPop';
import type { ResultKind, ResultLine } from '../copy';

const TONES: Record<ResultKind, MarkTone> = { success: 'success', danger: 'danger', quiet: 'muted' };

/** How the attempt went, in the colour of the verdict, with the pattern's name at the end of the row. */
export function ResultRow({ result, pattern }: { result: ResultLine; pattern?: string }) {
  return (
    <p class={`pause-result is-${result.kind}`}>
      <CheckPop tone={TONES[result.kind]} />
      {result.text}
      {pattern && <span class="pause-pattern">{pattern}</span>}
    </p>
  );
}

/** The takeaway to reuse in other games. */
export function Remember({ text }: { text: string }) {
  return (
    <p class="pause-remember">
      <span>Remember</span> {text}
    </p>
  );
}
