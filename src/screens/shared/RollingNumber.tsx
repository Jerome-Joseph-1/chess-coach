import './screen.css';

/** A count whose digits roll into place when it appears or changes. */
export function RollingNumber({ value }: { value: number }) {
  const digits = String(Math.max(0, Math.round(value))).split('');
  return (
    <span class="rolling">
      <span class="sr-only">{value}</span>
      <span class="rolling-digits" aria-hidden="true">
        {digits.map((digit, i) => {
          const fromRight = digits.length - 1 - i;
          return (
            <span class="rolling-digit" key={fromRight}>
              <span class="rolling-strip" style={{ '--d': digit, '--k': fromRight }} />
            </span>
          );
        })}
      </span>
    </span>
  );
}
