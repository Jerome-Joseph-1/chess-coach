import './screen.css';

export interface SegmentedOption<T> {
  value: T;
  label: string;
  /** A quieter word after the label, e.g. the side you play. */
  hint?: string;
}

export interface SegmentedProps<T extends string | number> {
  label: string;
  options: SegmentedOption<T>[];
  value: T;
  onChange: (value: T) => void;
}

/** A pill of options with one selected; the thumb slides to the chosen one. */
export function Segmented<T extends string | number>({ label, options, value, onChange }: SegmentedProps<T>) {
  const selected = Math.max(0, options.findIndex((o) => o.value === value));
  return (
    <div class="segmented" role="group" aria-label={label} style={{ '--n': options.length, '--i': selected }}>
      <span class="segmented-thumb" aria-hidden="true" />
      {options.map((o) => (
        <button key={o.value} type="button" aria-pressed={o.value === value} onClick={() => onChange(o.value)}>
          {o.label}
          {o.hint && <span class="segmented-hint">{o.hint}</span>}
        </button>
      ))}
    </div>
  );
}
