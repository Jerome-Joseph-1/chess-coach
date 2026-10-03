import { describe, expect, it } from 'vitest';
import type { MomentResult } from '../content/types';
import type { StoredReview } from './model';
import { dueItems, updateReviews } from './srs';
import { DAY, moment, noon, wrong } from './testkit';

function answer(reviews: StoredReview[], m: MomentResult): StoredReview[] {
  return updateReviews(reviews, m);
}

function dueIn(reviews: StoredReview[], from: number): number | undefined {
  return reviews[0] && (reviews[0].due - from) / DAY;
}

describe('scheduling', () => {
  it('brings a missed moment back after 1, 3, 7 and 21 days, then retires it', () => {
    let reviews = answer([], wrong());
    expect(dueIn(reviews, noon())).toBe(1);
    const gaps: (number | undefined)[] = [];
    for (let day = 1; reviews.length > 0 && day < 100; day += 1) {
      const at = reviews[0].due;
      reviews = answer(reviews, moment({ at }));
      gaps.push(dueIn(reviews, at));
    }
    expect(gaps).toEqual([3, 7, 21, undefined]);
  });

  it('brings a first-time right moment back after 7 and then 30 days', () => {
    let reviews = answer([], moment());
    expect(dueIn(reviews, noon())).toBe(7);
    const at = reviews[0].due;
    reviews = answer(reviews, moment({ at }));
    expect(dueIn(reviews, at)).toBe(30);
    expect(answer(reviews, moment({ at: reviews[0].due }))).toEqual([]);
  });

  it('starts over after a miss, wherever the item was', () => {
    let reviews = answer([], moment());
    reviews = answer(reviews, wrong({ at: reviews[0].due }));
    expect(reviews[0].box).toBe(0);
    expect(dueIn(reviews, noon(7))).toBe(1);
  });

  it('keeps one item per moment', () => {
    const reviews = answer(answer([], wrong()), wrong({ at: noon(1) }));
    expect(reviews).toHaveLength(1);
  });

  it('treats a partly wrong answer as a miss', () => {
    const m = moment({ outcomes: [{ step: 'spot', correct: true }, { step: 'find', correct: false }] });
    expect(answer([], m)[0].box).toBe(0);
  });
});

describe('due reviews', () => {
  const pauseReview = (ply: number, due: number): StoredReview => ({
    opening: 'italian', level: 1400, gameId: 'italian-1400-0001', ply, box: 0, due, type: 'pause',
  });
  const quietMoment = (ply: number): MomentResult => moment({ ply, type: 'nothing', kinds: [], at: noon(ply) });

  it('returns due items oldest first for the requested set only', () => {
    const reviews = [
      pauseReview(5, noon(3)),
      pauseReview(1, noon(1)),
      pauseReview(9, noon(20)),
      { ...pauseReview(7, noon(1)), level: 1700 as const },
    ];
    const due = dueItems(reviews, [], 'italian', 1400, noon(5));
    expect(due.map((r) => r.ply)).toEqual([1, 5]);
  });

  it('pulls past quiet moments in so about a third are quiet', () => {
    const reviews = [1, 2, 3, 4].map((ply) => pauseReview(ply, noon(ply)));
    const quiet = [11, 12, 13, 14, 15].map(quietMoment);
    const due = dueItems(reviews, quiet, 'italian', 1400, noon(10));
    expect(due).toHaveLength(6);
    expect(due.slice(4).map((r) => r.ply)).toEqual([11, 12]);
    expect(due.slice(4).every((r) => r.due === noon(10))).toBe(true);
  });

  it('counts quiet items that are already due', () => {
    const reviews = [1, 2, 3, 4].map((ply) => pauseReview(ply, noon(ply)));
    reviews.push({ ...pauseReview(11, noon(1)), type: 'nothing' });
    const due = dueItems(reviews, [quietMoment(12), quietMoment(13)], 'italian', 1400, noon(10));
    expect(due.map((r) => r.ply)).toEqual([1, 11, 2, 3, 4, 12]);
  });

  it('skips quiet moments that are already scheduled and adds none when no pauses are due', () => {
    const scheduled = { ...pauseReview(11, noon(30)), type: 'nothing' as const };
    const reviews = [pauseReview(1, noon(1)), pauseReview(2, noon(2)), scheduled];
    const due = dueItems(reviews, [quietMoment(11), quietMoment(12)], 'italian', 1400, noon(10));
    expect(due.map((r) => r.ply)).toEqual([1, 2, 12]);
    expect(dueItems([], [quietMoment(12)], 'italian', 1400, noon(10))).toEqual([]);
  });
});
