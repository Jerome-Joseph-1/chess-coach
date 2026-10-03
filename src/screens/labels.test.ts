import { describe, expect, it } from 'vitest';
import { STAT_LABELS, leadLabel, playPath, ratingLine, reviewPath, sideLine } from './shared/labels';

describe('opening wording', () => {
  it('says which side you play and who you face', () => {
    expect(sideLine('italian')).toBe('You play White');
    expect(sideLine('caro-kann')).toBe('You play Black');
    expect(ratingLine(1400)).toBe('Opponents rated 1400');
  });

  it('names the parts of the week in plain words', () => {
    expect(STAT_LABELS).toEqual({ win: 'Chances to win', defend: 'Threats', trap: 'Traps', nothing: 'Quiet' });
  });

  it('says who is ahead in material and by how much', () => {
    expect(leadLabel('Black', 2)).toBe('Black is ahead by 2 points of material');
    expect(leadLabel('You', 1)).toBe('You are ahead by 1 point of material');
  });
});

describe('routes', () => {
  it('builds the play and review routes the router expects', () => {
    expect(playPath('caro-kann', 1700)).toBe('/play/caro-kann/1700');
    expect(reviewPath({ opening: 'italian', level: 1400, gameId: 'italian-1400-0001', ply: 7 })).toBe('/play/italian/1400?review=italian-1400-0001:7');
    const drill = { opening: 'italian' as const, level: 1400 as const, gameId: 'italian-1100-0042', ply: 27, drillSet: 'italian-1100' };
    expect(reviewPath(drill)).toBe('/practice/italian-1100/italian-1100-0042/27');
  });
});
