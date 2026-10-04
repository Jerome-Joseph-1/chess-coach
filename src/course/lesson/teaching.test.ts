import { beforeEach, describe, expect, it, vi } from 'vitest';
import { lessonFor } from '../../learn';
import type { Beat } from '../../learn/walkthrough';
import { italian2 } from '../../pause/testGames';
import { slowPlan } from '../../pause/testTeaching';
import { OPENING_LESSONS } from '../openings';
import { openingBeats, teachingFor } from '../openings/teach';
import type { LessonPosition } from '../select';
import { lessonRemember, openingExample, practiceTeaching } from './teaching';

vi.mock('../openings/teach', () => ({ openingBeats: vi.fn(), openingLessonAt: vi.fn(), teachingFor: vi.fn() }));

const position: LessonPosition = { ref: { set: 'italian-1400', gameId: italian2.id, ply: italian2.turns[5].ply, findShare: 0 }, game: italian2, turnIndex: 5 };
const beats: Beat[] = [{ fen: italian2.turns[5].fen, text: 'Look at e4.', marks: [], arrows: [] }];

beforeEach(() => {
  vi.mocked(openingBeats).mockReturnValue(beats);
  vi.mocked(teachingFor).mockReturnValue(slowPlan);
});

describe('openingExample', () => {
  it("gives an opening lesson's own steps, with its chip and takeaway", () => {
    const { name, icon, remember } = OPENING_LESSONS['italian-slow'];
    expect(openingExample('italian-slow', position)).toEqual({ beats, label: { name, icon, remember } });
    expect(openingBeats).toHaveBeenCalledWith('italian-slow', italian2, 5);
  });

  it('falls back to the tactic walkthrough when the lesson has no steps here, and for a tactic lesson', () => {
    expect(openingExample('fork', position)).toBeNull();
    vi.mocked(openingBeats).mockReturnValue(null);
    expect(openingExample('italian-slow', position)).toBeNull();
  });
});

describe('practiceTeaching', () => {
  it("gives an opening lesson's teaching for the position, and none for a tactic lesson", () => {
    expect(practiceTeaching('italian-slow', position)).toBe(slowPlan);
    expect(teachingFor).toHaveBeenCalledWith('italian-slow', italian2, 5);
    expect(practiceTeaching('fork', position)).toBeUndefined();
  });

  it('gives none when the lesson does not fit the position', () => {
    vi.mocked(teachingFor).mockReturnValue(null);
    expect(practiceTeaching('italian-slow', position)).toBeUndefined();
  });
});

describe('lessonRemember', () => {
  it("ends on the opening lesson's takeaway, or the tactic of the worked example", () => {
    expect(lessonRemember('italian-slow', position)).toBe(OPENING_LESSONS['italian-slow'].remember);
    expect(lessonRemember('fork', position)).toBe(lessonFor(italian2, 5).remember);
  });
});
