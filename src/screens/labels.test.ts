import { describe, expect, it } from 'vitest';
import { STAT_LABELS, playPath, ratingLine, reviewPath, sideLine } from './shared/labels';

describe('opening wording', () => {
  it('says which side you play and who you face', () => {
    expect(sideLine('italian')).toBe('You play White');
    expect(sideLine('caro-kann')).toBe('You play Black');
    expect(ratingLine(1400)).toBe('Opponents rated 1400');
  });

  it('names the parts of the week in plain words', () => {
    expect(STAT_LABELS).toEqual({ win: 'Chances to win', defend: 'Threats', trap: 'Traps', nothing: 'Quiet' });
  });
});

describe('routes', () => {
  it('builds the play and review routes the router expects', () => {
    expect(playPath('caro-kann', 1700)).toBe('/play/caro-kann/1700');
    expect(reviewPath({ opening: 'italian', level: 1400, gameId: 'italian-1400-0001', ply: 7 })).toBe('/play/italian/1400?review=italian-1400-0001:7');
  });
});
