import type { Level, MomentResult, OpeningId, ReviewItem } from '../content/types';
import { isRight } from './moments';
import type { StoredReview } from './model';

export const DAY_MS = 86_400_000;

/** Where an item sits in its ladder, how long until it is due, and the box it moves to when answered right. */
export const BOXES: { days: number; next: number | null }[] = [
  { days: 1, next: 1 },
  { days: 3, next: 2 },
  { days: 7, next: 3 },
  { days: 21, next: null },
  { days: 7, next: 5 },
  { days: 30, next: null },
];

const MISSED_BOX = 0;
const FIRST_TIME_RIGHT_BOX = 4;

export function reviewKey(r: { gameId: string; ply: number }): string {
  return `${r.gameId}:${r.ply}`;
}

function place(m: MomentResult, box: number): StoredReview {
  const { opening, level, gameId, ply, type } = m;
  return { opening, level, gameId, ply, type, box, due: m.at + BOXES[box].days * DAY_MS };
}

function nextBox(current: StoredReview | undefined, m: MomentResult): number | null {
  if (!isRight(m)) return MISSED_BOX;
  return current ? BOXES[current.box].next : FIRST_TIME_RIGHT_BOX;
}

/** Applies one answer to the review list: schedules, advances or retires the moment's item. */
export function updateReviews(reviews: StoredReview[], m: MomentResult): StoredReview[] {
  const key = reviewKey(m);
  const current = reviews.find((r) => !r.drillSet && reviewKey(r) === key);
  const box = nextBox(current, m);
  const rest = reviews.filter((r) => r !== current);
  return box === null ? rest : [...rest, place(m, box)];
}

/** A lesson's practice position on the review list: the set its game is in, and the level whose Today shows it. */
export type DrillSpot = Pick<ReviewItem, 'opening' | 'level' | 'gameId' | 'ply'> & { drillSet: string };

const sameDrill = (r: StoredReview, d: DrillSpot) => r.drillSet === d.drillSet && r.gameId === d.gameId && r.ply === d.ply;

/** Applies a practice answer: a miss puts the position on the list for tomorrow; a right one moves it up, if it is listed. */
export function updateDrillReviews(reviews: StoredReview[], drill: DrillSpot, right: boolean, at: number): StoredReview[] {
  const current = reviews.find((r) => sameDrill(r, drill));
  const box = right ? (current ? BOXES[current.box].next : null) : MISSED_BOX;
  const rest = reviews.filter((r) => r !== current);
  if (box === null) return rest;
  const { opening, level, gameId, ply, drillSet } = current ?? drill;
  return [...rest, { opening, level, gameId, ply, drillSet, type: 'pause', box, due: at + BOXES[box].days * DAY_MS }];
}

// A review made only of problems would tell the user something is always there.
function pastNothings(reviews: StoredReview[], moments: MomentResult[], opening: OpeningId, level: Level): MomentResult[] {
  const scheduled = new Set(reviews.map(reviewKey));
  const seen = new Set<string>();
  return moments.filter((m) => {
    const key = reviewKey(m);
    const eligible = m.type === 'nothing' && m.opening === opening && m.level === level && !scheduled.has(key) && !seen.has(key);
    if (eligible) seen.add(key);
    return eligible;
  });
}

/** Due items, oldest first, topped up with past 'nothing' moments so they make up about a third. */
export function dueItems(reviews: StoredReview[], moments: MomentResult[], opening: OpeningId, level: Level, now: number): ReviewItem[] {
  const due = reviews
    .filter((r) => r.opening === opening && r.level === level && r.due <= now)
    .sort((a, b) => a.due - b.due);
  const quiet = due.filter((r) => r.type === 'nothing').length;
  const wanted = Math.round((due.length - quiet) / 2) - quiet;
  const extras = wanted > 0 ? pastNothings(reviews, moments, opening, level).slice(0, wanted) : [];
  return [...due, ...extras.map((m) => ({ ...place(m, FIRST_TIME_RIGHT_BOX), due: now }))];
}
