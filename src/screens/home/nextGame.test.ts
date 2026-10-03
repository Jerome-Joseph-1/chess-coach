import { describe, expect, it } from 'vitest';
import type { Game, SetIndex, Turn } from '../../content/types';
import { estimateMinutes, keyPositions, nextGameParts, pickNextGame } from './nextGame';

const set: SetIndex = {
  opening: 'italian',
  level: 1400,
  side: 'w',
  start: [],
  games: ['a', 'b', 'c'].map((id) => ({ id, moves: [] })),
};

describe('next game', () => {
  it('is the first game not played yet', () => {
    expect(pickNextGame(set, [])).toEqual({ id: 'a', number: 1 });
    expect(pickNextGame(set, ['a', 'c'])).toEqual({ id: 'b', number: 2 });
  });

  it('starts the set over once every game is played', () => {
    expect(pickNextGame(set, ['c', 'b', 'a'])).toEqual({ id: 'a', number: 1 });
  });

  it('is none for an empty set', () => {
    expect(pickNextGame({ ...set, games: [] }, [])).toBeNull();
  });
});

describe('key positions', () => {
  it('counts the critical turns only', () => {
    const turn = (label: Turn['label']) => ({ label }) as Turn;
    const game = { turns: [turn('critical'), turn('gray'), turn('nothing'), turn('critical')] } as Game;
    expect(keyPositions(game)).toBe(2);
  });
});

describe('time estimate', () => {
  it('grows with the stage and shrinks in quick mode', () => {
    expect(estimateMinutes(5, 3, false)).toBe(4);
    expect(estimateMinutes(5, 5, false)).toBe(5);
    expect(estimateMinutes(5, 3, true)).toBe(2);
  });

  it('is never under a minute', () => {
    expect(estimateMinutes(0, 1, false)).toBe(1);
  });
});

describe('next game row', () => {
  const next = { id: 'm', number: 13 };

  it('reads like the Today card', () => {
    expect(nextGameParts(next, 5, 3, false)).toEqual({ what: '5 key positions', time: 'about 4 min' });
  });

  it('handles one position, none, and a game that did not load', () => {
    expect(nextGameParts(next, 1, 3, false)).toEqual({ what: '1 key position', time: 'about 1 min' });
    expect(nextGameParts(next, 0, 3, false)).toEqual({ what: 'No key positions', time: 'about 1 min' });
    expect(nextGameParts(next, null, 3, false)).toEqual({ what: 'Game 13', time: null });
  });

  it('shortens the time in quick games', () => {
    expect(nextGameParts(next, 5, 3, true).time).toBe('about 2 min');
  });
});
