import { describe, expect, it } from 'vitest';
import type { Turn } from '../../content/types';
import { moment, wrong } from '../../progress/testkit';
import { handledWell, kindPhrase, momentSub, momentTitle, momentTone } from './moments';

const START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

function turn(overrides: Partial<Turn>): Turn {
  return { fen: START, material: 0, lines: {}, ...overrides } as Turn;
}

// White to move; the pawn on e5 can be taken by the d4 pawn.
const TAKE_PAWN = '4k3/8/8/4p3/3P4/8/8/4K3 w - - 0 1';
// White to move; the rook on a1 can take the black queen on a8.
const TAKE_QUEEN = 'q3k3/8/8/8/8/8/8/R3K3 w - - 0 1';
// White to move; Black threatens to take the knight on e4 with the pawn on d5.
const KNIGHT_THREATENED = '4k3/8/8/3p4/4N3/8/8/4K3 w - - 0 1';

describe('key position titles', () => {
  it('names what a winning move takes', () => {
    expect(kindPhrase(moment({ kinds: ['win'] }), turn({ fen: TAKE_PAWN, lines: { best: ['d4e5'] } }))).toBe('Win a pawn');
    expect(kindPhrase(moment({ kinds: ['win'] }), turn({ fen: TAKE_QUEEN, lines: { best: ['a1a8'] } }))).toBe('Win the queen');
  });

  it('says "win back" when the player is behind', () => {
    expect(kindPhrase(moment({ kinds: ['win'] }), turn({ fen: TAKE_PAWN, material: -1, lines: { best: ['d4e5'] } }))).toBe('Win back a pawn');
  });

  it('keeps a general phrase when the move takes nothing or the game did not load', () => {
    expect(kindPhrase(moment({ kinds: ['win'] }), turn({ lines: { best: ['e2e4'] } }))).toBe('Win material');
    expect(kindPhrase(moment({ kinds: ['win'] }))).toBe('Win material');
  });

  it('names the piece a threat would take', () => {
    expect(kindPhrase(moment({ kinds: ['defend'] }), turn({ fen: KNIGHT_THREATENED, lines: { threat: ['d5e4'] } }))).toBe('Save your knight');
    expect(kindPhrase(moment({ kinds: ['defend'] }), turn({ fen: '4k3/8/8/8/4n3/8/8/4K2R w - - 0 1', lines: { threat: ['e4c3'] } }))).toBe('Stop the threat');
    expect(kindPhrase(moment({ kinds: ['defend'] }))).toBe('Stop the threat');
  });

  it('uses the first kind when there are several', () => {
    expect(kindPhrase(moment({ kinds: ['trap', 'win'] }))).toBe('Avoid the trap');
  });

  it('covers quiet and unlabelled positions', () => {
    expect(kindPhrase(moment({ type: 'nothing', kinds: [] }))).toBe('Nothing special');
    expect(kindPhrase(moment({ kinds: [] }))).toBe('Key position');
  });

  it('puts the move number in front', () => {
    expect(momentTitle(moment({ moveNo: 11, kinds: ['trap'] }))).toBe('Move 11 · Avoid the trap');
  });

  it('survives a line that does not fit the position', () => {
    expect(kindPhrase(moment({ kinds: ['win'] }), turn({ lines: { best: ['a1a8'] } }))).toBe('Win material');
  });
});

describe('key position results', () => {
  const half = [{ step: 'spot' as const, correct: true }, { step: 'find' as const, correct: false }];

  it('says how each kind of position went', () => {
    expect(momentSub(moment({ outcomes: [{ step: 'spot', correct: true }, { step: 'find', correct: true }, { step: 'solve', correct: true }] }))).toBe('Spotted it and found the move');
    expect(momentSub(moment({ type: 'silent', outcomes: [{ step: 'solve', correct: true }] }))).toBe('Found it without a hint');
    expect(momentSub(moment({ type: 'nothing', kinds: [] }))).toBe('Right, nothing special');
    expect(momentSub(wrong())).toBe('Missed it');
  });

  it('only claims what the stage asked for', () => {
    expect(momentSub(moment())).toBe('Spotted it');
    expect(momentSub(moment({ outcomes: [{ step: 'spot', correct: true }, { step: 'find', correct: true }] }))).toBe('Spotted it and found the piece');
  });

  it('counts a half-right answer and a missed check as missed', () => {
    expect(momentSub(moment({ outcomes: half }))).toBe('Missed it');
    expect(momentSub(wrong({ type: 'silent' }))).toBe('Missed it');
    expect(momentSub(wrong({ type: 'nothing', kinds: [] }))).toBe('Missed it');
  });

  it('marks right, quiet and missed rows', () => {
    expect(momentTone(moment())).toBe('right');
    expect(momentTone(moment({ type: 'silent' }))).toBe('right');
    expect(momentTone(moment({ type: 'nothing', kinds: [] }))).toBe('quiet');
    expect(momentTone(wrong({ type: 'nothing', kinds: [] }))).toBe('missed');
    expect(momentTone(wrong())).toBe('missed');
  });
});

describe('handled well', () => {
  it('counts every key position, quiet ones and silent checks included', () => {
    const moments = [moment(), moment({ type: 'silent' }), moment({ type: 'nothing', kinds: [] }), wrong(), moment()];
    expect(handledWell(moments)).toEqual({ right: 4, total: 5 });
  });

  it('is 0 of 0 for a game without key positions', () => {
    expect(handledWell([])).toEqual({ right: 0, total: 0 });
  });
});
