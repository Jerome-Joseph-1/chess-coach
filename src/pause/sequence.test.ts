import { describe, expect, it } from 'vitest';
import type { Game } from '../content/types';
import olderItalian from './fixtures/italian-1400-0003.json';
import { captionParts, fenAt, sequenceKey, stepsOf } from './sequence';
import { italian1 } from './testGames';

const older = olderItalian as unknown as Game;
const turn = older.turns.find((t) => t.fen.startsWith('r2qkb1r/ppp2ppp/3p1n2/n2Pp3/4P1b1/3B1N2/PPP2PPP/RNBQK2R'))!;
const steps = stepsOf(turn.fen, ['b2b4', 'c7c6', 'b4a5', 'c6d5'], 'best');
const sequence = { steps };

describe('fenAt', () => {
  it('is the start before any move and the position after each move', () => {
    expect(fenAt(sequence, 0)).toBe(turn.fen);
    expect(fenAt(sequence, 1)).toBe(steps[0].after);
    expect(fenAt(sequence, 4)).toBe(steps[3].after);
  });
});

describe('captionParts', () => {
  it('gives the numbered move and what it does, as a sentence', () => {
    expect(captionParts(steps[2], 'w')).toEqual({ move: '8. bxa5', text: 'You take the knight' });
    expect(captionParts(steps[0], 'w')).toEqual({ move: '7. b4', text: 'Attacks the knight' });
  });

  it('numbers a Black move with an ellipsis', () => {
    expect(captionParts(steps[3], 'w')).toEqual({ move: '8… cxd5', text: 'Takes your pawn' });
  });

  it('gives just the move when there is nothing to say', () => {
    expect(captionParts(steps[1], 'w')).toEqual({ move: '7… c6', text: '' });
  });

  it('prefers a note over the usual description', () => {
    expect(captionParts({ ...steps[2], note: 'That loses your knight.' }, 'w').text).toBe('That loses your knight.');
  });
});

describe('stepsOf', () => {
  it('stops at an illegal move and marks every step with the arrow colour', () => {
    const line = stepsOf(italian1.turns[3].fen, ['d1d8', 'c6d8', 'a1a8'], 'mistake');
    expect(line.map((s) => s.san)).toEqual(['Qxd8+', 'Nxd8']);
    expect(line.every((s) => s.tone === 'mistake')).toBe(true);
  });
});

describe('sequenceKey', () => {
  it('is the same for the same moves from the same position', () => {
    expect(sequenceKey({ steps: stepsOf(turn.fen, ['b2b4'], 'best') })).toBe(sequenceKey({ steps: stepsOf(turn.fen, ['b2b4'], 'mistake') }));
    expect(sequenceKey({ steps: stepsOf(turn.fen, ['b2b4'], 'best') })).not.toBe(sequenceKey({ steps: stepsOf(turn.fen, ['h2h3'], 'best') }));
  });
});
