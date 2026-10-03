import { describe, expect, it } from 'vitest';
import { UNIT_IDS } from '../types';
import { INTROS } from './intros';

describe('unit intros', () => {
  it('say what each pattern is in two sentences and how to spot it in two or three steps', () => {
    for (const unit of UNIT_IDS) {
      const { intro, spot } = INTROS[unit];
      expect(intro.match(/[.!?](\s|$)/g), unit).toHaveLength(2);
      expect(spot.length, unit).toBeGreaterThanOrEqual(2);
      expect(spot.length, unit).toBeLessThanOrEqual(3);
      for (const text of [intro, ...spot]) expect(text, unit).toMatch(/^[A-Z][A-Za-z ,:;'.?-]+$/);
    }
  });
});
