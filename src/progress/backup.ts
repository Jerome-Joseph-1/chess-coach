import { PROGRESS_VERSION, SETTINGS_VERSION, readProgress, readSettings, type Progress, type StoredSettings } from './model';
import { isRecord, migrate } from './storage';

const APP_ID = 'chess-coach';
export const BACKUP_VERSION = 1;

export interface Backup {
  app: typeof APP_ID;
  version: number;
  exportedAt: string;
  settings: StoredSettings;
  progress: Progress;
}

export type BackupResult = { ok: true; settings: StoredSettings; progress: Progress } | { ok: false; error: string };

export function createBackup(settings: StoredSettings, progress: Progress, now = Date.now()): Backup {
  return { app: APP_ID, version: BACKUP_VERSION, exportedAt: new Date(now).toISOString(), settings, progress };
}

export function parseBackup(text: string): BackupResult {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { ok: false, error: 'That file is not valid JSON.' };
  }
  if (!isRecord(raw) || raw.app !== APP_ID) return { ok: false, error: 'That does not look like a Chess Coach backup.' };
  if (typeof raw.version === 'number' && raw.version > BACKUP_VERSION) {
    return { ok: false, error: 'That backup is from a newer version of the app.' };
  }
  const progress = readProgress(migrate(raw.progress, PROGRESS_VERSION));
  if (!progress) return { ok: false, error: 'The progress in that backup is missing or damaged.' };
  const settings = readSettings(migrate(raw.settings, SETTINGS_VERSION));
  return { ok: true, settings, progress };
}
