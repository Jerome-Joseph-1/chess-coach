export const KEYS = {
  settings: 'cc.settings.v1',
  progress: 'cc.progress.v1',
  ui: 'cc.ui.v1',
  pilot: 'cc.pilot.v1',
} as const;

export type Migration = (data: Record<string, unknown>) => Record<string, unknown>;

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

// Private mode and full quotas make localStorage throw; callers carry on with in-memory state.
export function readJson(key: string): unknown {
  try {
    const raw = localStorage.getItem(key);
    return raw === null ? null : JSON.parse(raw);
  } catch {
    return null;
  }
}

export function writeJson(key: string, value: unknown): boolean {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

export function removeKey(key: string): void {
  try {
    localStorage.removeItem(key);
  } catch {
    // nothing stored, nothing to remove
  }
}

/** Upgrades stored data one version at a time; steps[n] turns version n into n + 1. */
export function migrate(raw: unknown, current: number, steps: Record<number, Migration> = {}): Record<string, unknown> | null {
  if (!isRecord(raw)) return null;
  let data = raw;
  let version = typeof data.v === 'number' ? data.v : 1;
  if (version > current) return null;
  while (version < current) {
    const step = steps[version];
    if (!step) return null;
    version += 1;
    data = { ...step(data), v: version };
  }
  return data;
}
