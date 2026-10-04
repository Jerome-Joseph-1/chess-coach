import { describe, expect, it } from 'vitest';
import { lessonFor } from '../learn';
import { pauseLesson, patternIcon } from './patterns';
import { italian2 } from './testGames';
import { slowPlan } from './testTeaching';

describe('pauseLesson', () => {
  it("names the position's tactic, with why it works and the takeaway", () => {
    const lesson = lessonFor(italian2, 1);
    expect(pauseLesson(italian2, 1)).toEqual({
      pattern: { name: lesson.name, icon: patternIcon(lesson.theme) },
      idea: lesson.idea,
      remember: lesson.remember,
    });
  });

  it("names an opening lesson's plan when practising one", () => {
    expect(pauseLesson(italian2, 5, slowPlan)).toEqual({
      pattern: { name: 'The slow plan', icon: 'p-quiet' },
      idea: slowPlan.idea,
      remember: slowPlan.remember,
    });
  });
});
