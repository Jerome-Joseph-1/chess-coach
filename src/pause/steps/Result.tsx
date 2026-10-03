import { useEffect, useRef } from 'preact/hooks';
import { CoachBubble, PatternLabel, type PatternLabelProps } from '../Coach';
import { COPY, type ResultKind, type ResultLine } from '../copy';
import type { CoachTone } from '../prompt';
import { scrollIntoPanel } from '../Sheet';
import { Icon } from './icons';

const TONES: Record<ResultKind, CoachTone> = { success: 'success', danger: 'error', hint: 'hint', quiet: 'quiet' };

export interface ResultBubbleProps {
  result: ResultLine;
  /** The one sentence that says why. */
  text: string;
  pattern?: PatternLabelProps;
  /** A second line, e.g. why the game goes on with a different move. */
  note?: string;
}

/** How the attempt went, the pattern's name sliding in at the right, and why, in one sentence. */
export function ResultBubble({ result, text, pattern, note }: ResultBubbleProps) {
  return (
    <CoachBubble
      tone={TONES[result.kind]}
      eyebrow={result.text}
      aside={pattern && <span class="pattern-in">{<PatternLabel {...pattern} />}</span>}
      body={text}
    >
      {note && (
        <p class="coach-body coach-note rise-in" style={{ '--i': 3 }}>
          {note}
        </p>
      )}
    </CoachBubble>
  );
}

/** The takeaway to reuse in other games, on the coach's tint. It glides into view if it arrives under the fold. */
export function Remember({ text }: { text: string }) {
  const card = useRef<HTMLElement>(null);
  useEffect(() => scrollIntoPanel(card.current), []);
  return (
    <section class="remember-card" aria-label={COPY.remember} ref={card}>
      <span class="remember-head">
        <Icon name="bookmark" size={16} />
        <span class="eyebrow">{COPY.remember}</span>
      </span>
      <p>{text}</p>
    </section>
  );
}
