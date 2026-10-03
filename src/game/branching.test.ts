import { describe, expect, it } from 'vitest';
import type { SetIndex } from '../content/types';
import { findSibling } from './branching';

const set: SetIndex = {
  opening: 'italian',
  level: 1400,
  side: 'w',
  start: ['e4', 'e5', 'Nf3', 'Nc6', 'Bc4'],
  games: [
    { id: 'a', moves: ['Nf6', 'd4', 'Nxe4'] },
    { id: 'b', moves: ['Nf6', 'd3', 'Bc5'] },
    { id: 'c', moves: ['Nf6', 'd4', 'exd4'] },
  ],
};

describe('findSibling', () => {
  it('prefers the current game when it matches', () => {
    expect(findSibling(set, ['Nf6', 'd4'], 'c')).toBe('c');
    expect(findSibling(set, ['Nf6', 'd4'], 'a')).toBe('a');
  });

  it('falls back to the first matching game', () => {
    expect(findSibling(set, ['Nf6', 'd4'], 'b')).toBe('a');
    expect(findSibling(set, ['Nf6', 'd3'], 'a')).toBe('b');
  });

  it('matches a prefix only', () => {
    expect(findSibling(set, ['Nf6', 'd4', 'exd4'], 'a')).toBe('c');
    expect(findSibling(set, ['Nf6', 'd4', 'exd4', 'Nxd4'], 'a')).toBeNull();
  });

  it('is null when nothing continues that way', () => {
    expect(findSibling(set, ['Nf6', 'Ng5'], 'a')).toBeNull();
    expect(findSibling(set, ['h6'], 'a')).toBeNull();
  });

  it('matches every game for an empty prefix, current first', () => {
    expect(findSibling(set, [], 'b')).toBe('b');
    expect(findSibling(set, [], 'x')).toBe('a');
  });
});
