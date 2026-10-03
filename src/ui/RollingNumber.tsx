import { useRef } from 'preact/hooks';
import './rewards.css';

export function formatSigned(n: number): string {
  if (n === 0) return '0';
  return n > 0 ? `+${n}` : `−${-n}`;
}

export interface RollingNumberProps {
  value: number;
  format?: (n: number) => string;
}

/** Shows a count; when it changes the old figure rolls out and the new one rolls in. */
export function RollingNumber({ value, format = String }: RollingNumberProps) {
  const shown = useRef(value);
  const from = shown.current;
  shown.current = value;
  const dir = value >= from ? 'up' : 'down';
  return (
    <span class="roll" data-dir={dir}>
      <span class="roll-in" key={value}>
        {format(value)}
      </span>
      {from !== value && (
        <span class="roll-out" key={`out-${from}`} aria-hidden="true">
          {format(from)}
        </span>
      )}
    </span>
  );
}
