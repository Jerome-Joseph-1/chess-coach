import { dayKey } from '../../progress/days';
import { KEYS, isRecord, readJson, writeJson } from '../../progress/storage';

/**
 * True the first time a given highlight asks on a calendar day, false after that.
 * The day sits with the other UI flags; a browser that refuses storage just sees it every time.
 */
export function firstTimeToday(name: string, now: number): boolean {
  const field = `${name}On`;
  const today = dayKey(now);
  try {
    const ui = readJson(KEYS.ui);
    const flags = isRecord(ui) ? ui : {};
    if (flags[field] === today) return false;
    writeJson(KEYS.ui, { ...flags, v: 1, [field]: today });
    return true;
  } catch {
    return false;
  }
}
