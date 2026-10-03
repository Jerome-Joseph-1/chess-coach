import { describe, expect, it } from 'vitest';
import { moment, wrong } from '../progress/testkit';
import { momentLabel, outcomeText, playPath, ratingLine, reviewPath, sideLine } from './shared/labels';

describe('recap wording', () => {
  it('describes how each kind of moment went', () => {
    expect(outcomeText(moment())).toBe('Spotted it');
    expect(outcomeText(wrong())).toBe('Missed it');
    expect(outcomeText(moment({ type: 'silent' }))).toBe('Found it without a hint');
    expect(outcomeText(wrong({ type: 'silent' }))).toBe('Missed it');
    expect(outcomeText(moment({ type: 'nothing', kinds: [] }))).toBe('Right, nothing special');
    expect(outcomeText(wrong({ type: 'nothing', kinds: [] }))).toBe('Missed it');
  });

  it('counts a half-right answer as missed', () => {
    const partly = moment({ outcomes: [{ step: 'spot', correct: true }, { step: 'find', correct: false }] });
    expect(outcomeText(partly)).toBe('Missed it');
  });

  it('labels moments by their kinds', () => {
    expect(momentLabel(moment({ kinds: ['win', 'trap'] }))).toBe('Chance to win · Trap');
    expect(momentLabel(moment({ kinds: ['defend'] }))).toBe('Threat');
    expect(momentLabel(moment({ kinds: [] }))).toBe('Key position');
    expect(momentLabel(moment({ type: 'nothing', kinds: [] }))).toBe('Quiet position');
  });

  it('builds the play and review routes the router expects', () => {
    expect(playPath('caro-kann', 1700)).toBe('/play/caro-kann/1700');
    expect(reviewPath({ opening: 'italian', level: 1400, gameId: 'italian-1400-0001', ply: 7 })).toBe('/play/italian/1400?review=italian-1400-0001:7');
  });
});

describe('opening wording', () => {
  it('says which side you play and who you face', () => {
    expect(sideLine('italian')).toBe('You play White');
    expect(sideLine('caro-kann')).toBe('You play Black');
    expect(ratingLine(1400)).toBe('Opponents rated 1400');
  });
});
