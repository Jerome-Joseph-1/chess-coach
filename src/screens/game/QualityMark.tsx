import type { Verdict } from '../../pause/PauseSheet';

interface Mark {
  label: string;
  glyph: string;
  /** The glyph is a filled shape rather than a line. */
  solid?: boolean;
}

const MARKS: Partial<Record<Verdict, Mark>> = {
  found: { label: 'Found', glyph: 'M8 4.2V9M8 11.6V11.65' },
  hinted: {
    label: 'Found with a hint',
    glyph:
      'M8 3.6C7.37 3.6 6.76 3.8 6.25 4.17C5.74 4.53 5.35 5.05 5.15 5.65C4.95 6.25 4.95 6.89 5.14 7.49C5.32 8.1 5.7 8.62 6.2 9C6.6 9.3 6.8 9.7 6.8 10.1V10.5H9.2V10.1C9.2 9.7 9.4 9.3 9.8 9C10.3 8.62 10.68 8.1 10.86 7.49C11.05 6.89 11.05 6.25 10.85 5.65C10.65 5.05 10.26 4.53 9.75 4.17C9.24 3.8 8.63 3.6 8 3.6ZM6.9 11.5H9.1V12C9.1 12.33 8.83 12.6 8.5 12.6H7.5C7.17 12.6 6.9 12.33 6.9 12V11.5Z',
    solid: true,
  },
  missed: { label: 'Missed', glyph: 'M10.6 5.4L5.4 10.6M5.4 5.4L10.6 10.6' },
};

/** A small drawn disc beside a move that was a key position: "!" found, a bulb with a hint, a cross missed. */
export function QualityMark({ verdict }: { verdict: Verdict }) {
  const mark = MARKS[verdict];
  if (!mark) return null;
  return (
    <svg class={`quality-mark is-${verdict}`} viewBox="0 0 16 16" width="16" height="16" role="img" aria-label={mark.label}>
      <circle cx="8" cy="8" r="8" />
      <path d={mark.glyph} class={mark.solid ? 'is-solid' : undefined} />
    </svg>
  );
}
