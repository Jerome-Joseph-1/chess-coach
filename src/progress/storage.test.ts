import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { KEYS, isRecord, readJson, removeKey, writeJson } from './storage';
import { FakeStorage } from './testkit';

let storage: FakeStorage;

beforeEach(() => {
  storage = new FakeStorage();
  vi.stubGlobal('localStorage', storage);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('storage', () => {
  it('uses versioned keys', () => {
    expect(KEYS.settings).toBe('cc.settings.v1');
    expect(KEYS.progress).toBe('cc.progress.v1');
  });

  it('writes and reads JSON', () => {
    expect(writeJson('k', { a: [1, 2] })).toBe(true);
    expect(readJson('k')).toEqual({ a: [1, 2] });
  });

  it('reads null for a missing or corrupt value', () => {
    expect(readJson('missing')).toBeNull();
    storage.data.set('bad', '{nope');
    expect(readJson('bad')).toBeNull();
  });

  it('reports a refused write instead of throwing', () => {
    storage.failWrites = true;
    expect(writeJson('k', 1)).toBe(false);
  });

  it('copes with a localStorage that throws on every call', () => {
    const fail = () => {
      throw new Error('SecurityError');
    };
    vi.stubGlobal('localStorage', { getItem: fail, setItem: fail, removeItem: fail });
    expect(readJson('k')).toBeNull();
    expect(writeJson('k', 1)).toBe(false);
    expect(() => removeKey('k')).not.toThrow();
  });

  it('removes a key', () => {
    writeJson('k', 1);
    removeKey('k');
    expect(readJson('k')).toBeNull();
  });

  it('tells records from other values', () => {
    expect(isRecord({})).toBe(true);
    expect([null, [], 'x', 3, undefined].some(isRecord)).toBe(false);
  });
});
