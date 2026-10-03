import type { MomentResult } from '../content/types';

export const HOUR = 3_600_000;
export const DAY = 24 * HOUR;

/** Noon on a fixed local day, plus whole days. */
export function noon(daysFromStart = 0): number {
  return new Date(2026, 5, 1 + daysFromStart, 12).getTime();
}

export function moment(overrides: Partial<MomentResult> = {}): MomentResult {
  return {
    opening: 'italian',
    level: 1400,
    gameId: 'italian-1400-0001',
    ply: 3,
    moveNo: 5,
    type: 'pause',
    kinds: ['win'],
    depth: 1,
    outcomes: [{ step: 'spot', correct: true }],
    stars: 2,
    at: noon(),
    ...overrides,
  };
}

export function wrong(overrides: Partial<MomentResult> = {}): MomentResult {
  return moment({ outcomes: [{ step: 'spot', correct: false }], stars: 0, ...overrides });
}

export class FakeStorage {
  data = new Map<string, string>();
  failWrites = false;

  getItem(key: string): string | null {
    return this.data.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    if (this.failWrites) throw new Error('QuotaExceededError');
    this.data.set(key, value);
  }

  removeItem(key: string): void {
    this.data.delete(key);
  }
}
