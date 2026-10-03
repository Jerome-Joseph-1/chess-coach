import { describe, expect, it } from 'vitest';
import type { MomentResult } from '../content/types';
import type { StoredReview } from './model';
import { dueItems, updateDrillReviews, updateReviews, type DrillSpot } from './srs';
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

describe('practice positions from lessons', () => {
  // A 1100 position practised in a 1400 lesson: it comes back on the 1400 Today.
  const drill: DrillSpot = { opening: 'italian', level: 1400, drillSet: 'italian-1100', gameId: 'italian-1100-0042', ply: 27 };
  const practise = (reviews: StoredReview[], right: boolean, at = noon()) => updateDrillReviews(reviews, drill, right, at);

  it('lists a missed position for tomorrow, marked as practice, and nothing for a right first answer', () => {
    expect(practise([], true)).toEqual([]);
    expect(practise([], false)).toEqual([{ ...drill, type: 'pause', box: 0, due: noon(1) }]);
  });

  it('moves a listed position up the ladder like any review, and starts it over after a miss', () => {
    let reviews = practise([], false);
    const gaps: (number | undefined)[] = [];
    for (let day = 1; reviews.length > 0 && day < 100; day += 1) {
      const at = reviews[0].due;
      reviews = practise(reviews, true, at);
      gaps.push(dueIn(reviews, at));
    }
    expect(gaps).toEqual([3, 7, 21, undefined]);
    reviews = practise(practise(practise([], false), true, noon(1)), false, noon(4));
    expect(reviews).toEqual([{ ...drill, type: 'pause', box: 0, due: noon(5) }]);
  });

  it('keeps a practice position apart from the same position met in a game', () => {
    const game = moment({ gameId: drill.gameId, level: 1100, ply: drill.ply });
    const both = answer(practise([], false), wrong({ ...game }));
    expect(both).toHaveLength(2);
    expect(answer(both, game).filter((r) => r.drillSet)).toEqual(practise([], false));
    expect(practise(both, true, noon(1)).filter((r) => !r.drillSet)).toEqual(both.filter((r) => !r.drillSet));
  });

  it('is due on the Today of the lesson level', () => {
    const reviews = practise([], false);
    expect(dueItems(reviews, [], 'italian', 1400, noon(1)).map((r) => r.drillSet)).toEqual(['italian-1100']);
    expect(dueItems(reviews, [], 'italian', 1100, noon(1))).toEqual([]);
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
