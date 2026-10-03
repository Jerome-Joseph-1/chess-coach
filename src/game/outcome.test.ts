import { Chess } from 'chess.js';
import { describe, expect, it } from 'vitest';
import type { Game } from '../content/types';
import { outcomeText } from './outcome';

const game = (side: 'w' | 'b', bestWin?: number) =>
  ({ side, turns: bestWin === undefined ? [] : [{ bestWin }] }) as unknown as Game;

describe('outcomeText', () => {
  it('names a checkmate from the user side', () => {
    const mated = new Chess('rnb1kbnr/pppp1ppp/8/4p3/6Pq/5P2/PPPPP2P/RNBQKBNR w KQkq - 1 3');
    expect(outcomeText(mated, game('w'))).toBe('Checkmate. You lost this one.');
    expect(outcomeText(mated, game('b'))).toBe('Checkmate. You won.');
  });

  it('says how the game stands when the moves run out', () => {
    const chess = new Chess();
    expect(outcomeText(chess, game('w', 92))).toBe('That is the end of this game. You are winning.');
    expect(outcomeText(chess, game('w', 50))).toBe('That is the end of this game. The position is about equal.');
    expect(outcomeText(chess, game('w', 10))).toBe('That is the end of this game. You are losing.');
  });
});
