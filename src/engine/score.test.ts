import { describe, expect, it } from 'vitest';
import { forMover, forWhite, pawns, scoreValue, signedPawns } from './score';

describe('scoreValue', () => {
  it('orders mates above centipawns, quicker mates first', () => {
    const order = [{ mate: 1 }, { mate: 4 }, { cp: 900 }, { cp: -50 }, { mate: -6 }, { mate: -1 }, { mate: 0 }];
    const values = order.map(scoreValue);
    expect([...values].sort((a, b) => b - a)).toEqual(values);
  });
});

describe('forMover', () => {
  it('flips centipawns', () => {
    expect(forMover({ cp: 120 })).toEqual({ cp: -120 });
  });

  it('turns the answering side mating into the mover getting mated', () => {
    expect(forMover({ mate: 2 })).toEqual({ mate: -2 });
  });

  it('counts the move itself when the answering side gets mated', () => {
    expect(forMover({ mate: 0 })).toEqual({ mate: 1 });
    expect(forMover({ mate: -1 })).toEqual({ mate: 2 });
  });
});

describe('forWhite', () => {
  it('keeps White scores and flips Black ones', () => {
    expect(forWhite({ cp: 40 }, 'w')).toEqual({ cp: 40 });
    expect(forWhite({ cp: 40 }, 'b')).toEqual({ cp: -40 });
    expect(forWhite({ mate: 3 }, 'b')).toEqual({ mate: -3 });
  });
});

describe('pawns', () => {
  it('writes one decimal, with a real minus sign when signed', () => {
    expect(signedPawns(183)).toBe('+1.8');
    expect(signedPawns(-44)).toBe('−0.4');
    expect(signedPawns(4)).toBe('0.0');
    expect(pawns(-160)).toBe('1.6');
  });
});
