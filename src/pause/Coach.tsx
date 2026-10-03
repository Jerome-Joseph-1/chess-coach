import type { ComponentChildren, RefObject } from 'preact';
import { CrossFade } from './CrossFade';
import type { CoachTone } from './prompt';
import { Icon, type IconName } from './steps/icons';

/** The coach's face: a knight on an orange disc. */
export function CoachMark({ small = false }: { small?: boolean }) {
  return (
    <span class={`coach-mark${small ? ' is-small' : ''}`} aria-hidden="true">
      <svg viewBox="0 0 19.4 19.4">
        <path class="coach-knight" d="M9.68 2.17C15.74 2.74 19.21 6.79 18.92 18.92H5.63C5.63 13.72 11.41 15.17 10.26 6.79" />
        <path
          class="coach-knight"
          d="M10.83 6.79C11.05 8.47 7.63 11.05 6.21 11.99C4.48 13.14 4.58 14.5 3.32 14.3C2.72 13.76 4.14 12.54 3.32 12.57C2.74 12.57 3.43 13.28 2.74 13.72C2.17 13.72 0.43 14.3 0.43 11.41C0.43 10.26 3.9 4.48 3.9 4.48C3.9 4.48 4.99 3.38 5.06 2.46C4.63 1.88 4.77 1.3 4.77 0.72C5.34 0.14 6.5 2.17 6.5 2.17H7.66C7.66 2.17 8.11 1.01 9.1 0.43C9.68 0.43 9.68 2.17 9.68 2.17"
        />
        <path
          class="coach-knight-line"
          d="M11.15 2.4L10.89 3.24L11.18 3.32C13 3.9 14.44 4.76 15.74 7.22C17.04 9.68 17.62 13.18 17.33 18.92L17.3 19.21H18.6L18.63 18.92C18.92 13.11 18.12 9.19 16.76 6.59C15.39 4 13.41 2.76 11.45 2.46L11.15 2.4Z"
        />
        <circle class="coach-knight-line" cx="2.17" cy="11.12" r="0.45" />
        <ellipse class="coach-knight-line" cx="5.34" cy="5.34" rx="0.3" ry="0.8" transform="rotate(30 5.34 5.34)" />
      </svg>
    </span>
  );
}

const TONE_GLYPHS: Partial<Record<CoachTone, string>> = {
  success: 'M11.4 5.6L7 10L4.6 7.6',
  error: 'M10.6 5.4L5.4 10.6M5.4 5.4L10.6 10.6',
  quiet: 'M5 8H11',
};

/** The 16px round verdict mark; its glyph draws itself in when it appears. */
function ToneMark({ tone }: { tone: CoachTone }) {
  if (tone === 'hint') return <Icon name="lightbulb" size={16} class="tone-icon" />;
  return (
    <svg class={`tone-mark is-${tone}`} viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
      <circle cx="8" cy="8" r="8" />
      <path d={TONE_GLYPHS[tone]} pathLength={1} />
    </svg>
  );
}

export interface PatternLabelProps {
  name: string;
  icon: IconName;
}

/** The pattern's name in a small chip, e.g. "Trapped piece". */
export function PatternLabel({ name, icon }: PatternLabelProps) {
  return (
    <span class="pattern-label">
      <Icon name={icon} size={16} />
      {name}
    </span>
  );
}

/** One dot per step; the current one is stretched into a pill. */
export function StepDots({ step, total }: { step: number; total: number }) {
  return (
    <span class="step-dots" role="img" aria-label={`Step ${step} of ${total}`}>
      {Array.from({ length: total }, (_, i) => (
        <i key={i} class={i + 1 < step ? 'is-done' : i + 1 === step ? 'is-now' : undefined} />
      ))}
    </span>
  );
}

export interface CoachBubbleProps {
  tone: CoachTone;
  /** The small capitals line at the top: where we are, or how the answer went. */
  eyebrow?: string;
  /** Sits at the right of the eyebrow row: the step dots or the pattern label. */
  aside?: ComponentChildren;
  /** Takes the eyebrow's place, e.g. the pattern label once a hint has named it. */
  lead?: ComponentChildren;
  title?: string;
  body?: string;
  /** Says the body to screen readers as it changes. */
  live?: boolean;
  innerRef?: RefObject<HTMLDivElement>;
  children?: ComponentChildren;
}

/**
 * The coach speaks under the board: its mark, then a bubble whose lines fade up one after another.
 * A line that changes later cross-fades in place, with a short slide.
 */
export function CoachBubble({ tone, eyebrow, aside, lead, title, body, live = false, innerRef, children }: CoachBubbleProps) {
  return (
    <div class={`coach is-${tone}`}>
      <CoachMark />
      <div class="coach-bubble" ref={innerRef}>
        {(eyebrow || lead || aside) && (
          <div class="coach-head rise-in" style={{ '--i': 0 }}>
            {lead ?? (
              <CrossFade value={`${tone}:${eyebrow}`} class="coach-eyebrow">
                {tone !== 'neutral' && <ToneMark tone={tone} />}
                <span class="eyebrow">{eyebrow}</span>
              </CrossFade>
            )}
            {aside}
          </div>
        )}
        {title && (
          <h2 class="coach-title rise-in" style={{ '--i': 1 }}>
            <CrossFade value={title}>{title}</CrossFade>
          </h2>
        )}
        {body && (
          <p class="coach-body rise-in" style={{ '--i': 2 }} aria-live={live ? 'polite' : undefined}>
            <CrossFade value={body}>{body}</CrossFade>
          </p>
        )}
        {children}
      </div>
    </div>
  );
}
