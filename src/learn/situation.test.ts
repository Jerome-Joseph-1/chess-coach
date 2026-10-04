import { describe, expect, it } from 'vitest';
import { italian1, italian2 } from '../pause/testGames';
import { realTurn } from './fixtures';
import { SITUATIONS, situationsOf } from './situation';

const of = (key: Parameters<typeof realTurn>[0]) => situationsOf(realTurn(key), 0);

describe('situationsOf', () => {
  it('offers the five answers in a fixed order', () => {
    expect(SITUATIONS.map((s) => s.label)).toEqual(['Win material', 'Attack the king', 'Defend', 'Avoid a trap', 'Improve a piece']);
  });

  it('calls a win that takes material a win, whatever its pattern', () => {
    expect(situationsOf(italian1, 1)).toEqual(['win']);
    expect(of('italian-1700-0019#19')).toEqual(['win']);
    expect(of('caro-kann-1400-0022#8')).toEqual(['win']);
  });

  it('calls a win that mates an attack on the king, and one that threatens mate on the way to material either', () => {
    expect(of('italian-1400-0008#17')).toEqual(['attack']);
    expect(of('italian-2000-0009#18')).toEqual(['attack', 'win']);
  });

  it('calls every threat against the user a defence, a mate threat included', () => {
    expect(of('caro-kann-1100-0014#5')).toEqual(['defend']);
    expect(of('caro-kann-1400-0028#11')).toEqual(['defend']);
    expect(of('caro-kann-1700-0014#25')).toEqual(['defend']);
  });

  it('accepts any answer that fits when a position is about two things', () => {
    expect(situationsOf(italian1, 7)).toEqual(['win', 'defend']);
    expect(of('italian-1100-0027#16')).toEqual(['attack', 'defend']);
  });

  it('calls a trap a trap, and a calm position quiet', () => {
    expect(situationsOf(italian2, 1)).toEqual(['trap']);
    expect(of('caro-kann-2000-0001#3')).toEqual(['trap']);
    expect(situationsOf(italian1, 11)).toEqual(['quiet']);
    expect(of('italian-2000-0027#0')).toEqual(['quiet']);
  });
});
