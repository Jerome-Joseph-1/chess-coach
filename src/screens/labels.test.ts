import { describe, expect, it } from 'vitest';
import { moment, wrong } from '../progress/testkit';
import { momentLabel, outcomeText, playPath, reviewPath } from './shared/labels';

describe('recap wording', () => {
  it('describes how each kind of moment went', () => {
    expect(outcomeText(moment())).toBe('Found it');
    expect(outcomeText(wrong())).toBe('Missed');
    expect(outcomeText(moment({ type: 'silent' }))).toBe('Spotted without a hint');
    expect(outcomeText(moment({ type: 'nothing', kinds: [] }))).toBe('All quiet — right');
    expect(outcomeText(wrong({ type: 'nothing', kinds: [] }))).toBe('Nothing was there');
  });

  it('counts a half-right answer as missed', () => {
    const partly = moment({ outcomes: [{ step: 'spot', correct: true }, { step: 'find', correct: false }] });
    expect(outcomeText(partly)).toBe('Missed');
  });

  it('labels moments by their kinds', () => {
    expect(momentLabel(moment({ kinds: ['win', 'trap'] }))).toBe('Winning chance · Trap');
    expect(momentLabel(moment({ kinds: [] }))).toBe('Key moment');
    expect(momentLabel(moment({ type: 'nothing', kinds: [] }))).toBe('Quiet position');
  });

  it('builds the play and review routes the router expects', () => {
    expect(playPath('caro-kann', 1700)).toBe('/play/caro-kann/1700');
    expect(reviewPath({ opening: 'italian', level: 1400, gameId: 'italian-1400-0001', ply: 7 })).toBe('/play/italian/1400?review=italian-1400-0001:7');
  });
});
