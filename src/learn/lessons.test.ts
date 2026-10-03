import { describe, expect, it } from 'vitest';
import type { Game } from '../content/types';
import { learnGames, realTurn } from './fixtures';
import turns from './fixtures/turns.json';
import { lessonFor } from './lessons';

const realTurns = Object.keys(turns).map((key) => realTurn(key as keyof typeof turns));

function everyLesson(games: Game[]) {
  return games.flatMap((game) => game.turns.map((_, i) => ({ id: `${game.id}#${i}`, lesson: lessonFor(game, i) })));
}

describe('lessonFor on whole games', () => {
  const all = everyLesson([...learnGames, ...realTurns]);

  it('fills every field with clean sentences', () => {
    for (const { id, lesson } of all) {
      for (const text of [lesson.name, lesson.hint, lesson.remember]) expect(text, id).toMatch(/^[A-Z]/);
      // An idea may open with a pawn move such as "b4".
      expect(lesson.idea, id).toMatch(/^([A-Z]|[a-h][1-8x])/);
      for (const text of [lesson.name, lesson.idea, lesson.hint, lesson.remember]) {
        expect(text, id).not.toMatch(/undefined|null|NaN|\s{2}|\s[,.]/);
      }
      expect(lesson.idea, id).toMatch(/[.]$/);
      expect(lesson.name.split(' ').length, id).toBeLessThanOrEqual(3);
    }
  });

  it('highlights real squares', () => {
    for (const { id, lesson } of all) {
      for (const square of lesson.squares) expect(square, id).toMatch(/^[a-h][1-8]$/);
    }
  });

  it('never gives the move away in the hint', () => {
    for (const { id, lesson } of all) expect(lesson.hint, id).not.toMatch(/[a-h][1-8]/);
  });
});

describe('names, hints and takeaways', () => {
  it('pairs a fork with a nudge and a takeaway', () => {
    const fork = lessonFor(realTurn('italian-1400-0006#3'), 0);
    expect(fork.name).toBe('Fork');
    expect(fork.hint).toBe('One move can attack two things.');
    expect(fork.remember).toBe('Knights fork well: check every square your knight can jump to, especially with check.');
  });

  it('pairs a trapped piece with its nudge', () => {
    const trapped = lessonFor(realTurn('caro-kann-1700-0029#10'), 0);
    expect(trapped.hint).toBe("Look for a piece that can't escape.");
    expect(trapped.remember).toBe('A bishop hemmed in by pawns can get trapped. Count its squares.');
  });

  it('names threats after what to stop', () => {
    expect(lessonFor(realTurn('caro-kann-1400-0021#12'), 0).name).toBe('Stop the pin');
    expect(lessonFor(realTurn('caro-kann-1400-0014#16'), 0).name).toBe('Free your piece');
  });

  it('warns about baits by what they cost', () => {
    const bait = lessonFor(realTurn('caro-kann-1100-0013#7'), 0);
    expect(bait.name).toBe('Avoid the trap');
    expect(bait.remember).toBe('Before moving a piece, make sure its new square is safe.');
    expect(lessonFor(realTurn('italian-1400-0020#15'), 0).hint).toBe('Is that capture really free?');
  });

  it('keeps quiet positions calm', () => {
    const quiet = lessonFor(realTurn('caro-kann-1100-0001#24'), 0);
    expect(quiet.name).toBe('Quiet position');
    expect(quiet.remember).toBe('When nothing is happening, improve your worst piece.');
  });
});
