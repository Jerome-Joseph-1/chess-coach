const DAY_MS = 86_400_000;

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

/** Local calendar day as YYYY-MM-DD. */
export function dayKey(ms: number): string {
  const d = new Date(ms);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function dayNumber(key: string): number {
  const [y, m, d] = key.split('-').map(Number);
  return Date.UTC(y, m - 1, d) / DAY_MS;
}

/** Whole calendar days from a to b. */
export function daysBetween(a: string, b: string): number {
  return dayNumber(b) - dayNumber(a);
}

/** Monday-first columns of day keys, oldest week first, ending with the week that holds `now`. */
export function lastWeeks(now: number, weeks: number): string[][] {
  const today = new Date(now);
  const sinceMonday = (today.getDay() + 6) % 7;
  const columns: string[][] = [];
  for (let w = weeks - 1; w >= 0; w--) {
    const column: string[] = [];
    for (let d = 0; d < 7; d++) {
      const offset = d - sinceMonday - 7 * w;
      column.push(dayKey(new Date(today.getFullYear(), today.getMonth(), today.getDate() + offset).getTime()));
    }
    columns.push(column);
  }
  return columns;
}
