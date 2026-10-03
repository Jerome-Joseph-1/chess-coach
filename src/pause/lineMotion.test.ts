import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { BoardController } from '../board/types';
import { ARROW_MS, LEAD_MS, LineMotion, STEP_MS, controlState } from './lineMotion';
import { revealSequence } from './lines';
import { fenAfter } from './position';
import { fenAt, type Sequence } from './sequence';
import { italian1 } from './testGames';

/** A board that records what it is asked to do and takes a tick per animation. */
function fakeBoard(start: string) {
  const calls: string[] = [];
  let fen = start;
  let busy = 0;
  let overlapped = false;
  const tick = async () => {
    busy += 1;
    overlapped ||= busy > 1;
    await new Promise((resolve) => setTimeout(resolve, 1));
    busy -= 1;
  };
  const board = {
    fen: () => fen,
    async setPosition(next: string) {
      calls.push(`set ${next}`);
      await tick();
      fen = next;
    },
    async playMove(uci: string) {
      calls.push(`play ${uci}`);
      await tick();
      fen = fenAfter(fen, [uci]);
    },
    arrow: (from: string, to: string, tone: string) => calls.push(`arrow ${from}${to} ${tone}`),
    clearArrows: () => calls.push('clear'),
  } as unknown as BoardController;
  return { board, calls, now: () => fen, overlapped: () => overlapped };
}

const turn = italian1.turns[3];
const best = revealSequence(italian1, 3, null);
const withMistake = revealSequence(italian1, 3, 'd1d5');
const mistakeLength = withMistake.steps.length - best.steps.length;

function setup(sequence: Sequence = best) {
  const fake = fakeBoard(turn.fen);
  const steps: number[] = [];
  const playing: boolean[] = [];
  const motion = new LineMotion(fake.board, (n) => steps.push(n), (p) => playing.push(p));
  motion.setSequence(sequence);
  /** Board moves only, without the arrows around them. */
  const moves = () => fake.calls.filter((c) => c.startsWith('play') || c.startsWith('set'));
  return { ...fake, motion, steps, playing, moves };
}

/** Lets every queued step, arrow and animation finish. */
async function settle() {
  await vi.runAllTimersAsync();
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('LineMotion', () => {
  it('shows the start of a sequence when it is set, without playing moves', async () => {
    const { motion, calls, steps } = setup();
    await settle();
    await motion.settled();
    expect(calls.filter((c) => c !== 'clear')).toEqual([`set ${turn.fen}`]);
    expect(steps).toEqual([0]);
  });

  it('draws the arrow first, then plays the move, then clears the arrow', async () => {
    const { motion, calls } = setup();
    await settle();
    calls.length = 0;
    motion.goTo(1);
    await settle();
    const first = best.steps[0];
    expect(calls).toEqual(['clear', `arrow ${first.uci.slice(0, 2)}${first.uci.slice(2, 4)} best`, `play ${first.uci}`, 'clear']);
  });

  it('waits for the arrow before the piece moves', async () => {
    const { motion, calls } = setup();
    await settle();
    calls.length = 0;
    motion.goTo(1);
    await vi.advanceTimersByTimeAsync(ARROW_MS - 1);
    expect(calls.some((c) => c.startsWith('arrow'))).toBe(true);
    expect(calls.some((c) => c.startsWith('play'))).toBe(false);
    await vi.advanceTimersByTimeAsync(5);
    expect(calls.some((c) => c.startsWith('play'))).toBe(true);
  });

  it('plays moves forward one by one', async () => {
    const { motion, calls, now, steps } = setup();
    await settle();
    calls.length = 0;
    motion.goTo(3);
    await settle();
    expect(calls.filter((c) => c.startsWith('play'))).toEqual(best.steps.slice(0, 3).map((s) => `play ${s.uci}`));
    expect(steps.slice(-3)).toEqual([1, 2, 3]);
    expect(now()).toBe(fenAt(best, 3));
  });

  it('goes back with setPosition and takes the arrow off', async () => {
    const { motion, calls, now } = setup();
    motion.goTo(4);
    await settle();
    calls.length = 0;
    motion.goTo(1);
    await settle();
    expect(calls).toEqual(['clear', `set ${fenAt(best, 1)}`]);
    expect(now()).toBe(fenAt(best, 1));
  });

  it('queues quick taps instead of overlapping animations', async () => {
    const { motion, now, overlapped, steps } = setup();
    for (let i = 0; i < 4; i++) motion.goTo(motion.heading + 1);
    await settle();
    expect(overlapped()).toBe(false);
    expect(now()).toBe(fenAt(best, 4));
    expect(steps.at(-1)).toBe(4);
  });

  it('stays inside the sequence', async () => {
    const { motion, now } = setup();
    motion.goTo(99);
    await settle();
    expect(now()).toBe(fenAt(best, best.steps.length));
    motion.goTo(-5);
    await settle();
    expect(now()).toBe(fenAt(best, 0));
  });

  it('turns back without playing the move when the user taps back during its arrow', async () => {
    const { motion, calls, now } = setup();
    await settle();
    calls.length = 0;
    motion.goTo(1);
    await vi.advanceTimersByTimeAsync(ARROW_MS / 2);
    motion.goTo(0);
    await settle();
    expect(calls.some((c) => c.startsWith('play'))).toBe(false);
    expect(calls.at(-1)).toBe('clear');
    expect(now()).toBe(turn.fen);
  });

  it('resets to the start when another sequence is set', async () => {
    const { motion, now, steps } = setup();
    motion.goTo(3);
    await settle();
    motion.setSequence(withMistake);
    await settle();
    expect(now()).toBe(fenAt(withMistake, 0));
    expect(steps.at(-1)).toBe(0);
    motion.goTo(1);
    await settle();
    expect(now()).toBe(fenAt(withMistake, 1));
  });

  it('copes with a switch while a move is still animating', async () => {
    const { motion, now, steps } = setup();
    await settle();
    motion.goTo(3);
    await vi.advanceTimersByTimeAsync(ARROW_MS + 1);
    motion.setSequence(withMistake);
    await settle();
    expect(now()).toBe(fenAt(withMistake, 0));
    expect(steps.at(-1)).toBe(0);
    motion.goTo(2);
    await settle();
    expect(now()).toBe(fenAt(withMistake, 2));
  });

  it('goes back to the pause position between the mistake and the best line', async () => {
    const { motion, moves, now } = setup(withMistake);
    await settle();
    motion.goTo(mistakeLength);
    await settle();
    expect(now()).toBe(fenAt(withMistake, mistakeLength));
    expect(now()).not.toBe(turn.fen);

    const before = moves().length;
    motion.goTo(mistakeLength + 1);
    await settle();
    expect(moves().slice(before)).toEqual([`set ${turn.fen}`, `play ${best.steps[0].uci}`]);
    expect(now()).toBe(fenAt(withMistake, mistakeLength + 1));
  });

  it('leads the mistake with its own arrow colour and the best line with the best one', async () => {
    const { motion, calls } = setup(withMistake);
    await settle();
    motion.goTo(mistakeLength + 1);
    await settle();
    const arrows = calls.filter((c) => c.startsWith('arrow'));
    expect(arrows[0].endsWith('mistake')).toBe(true);
    expect(arrows.at(-1)!.endsWith('best')).toBe(true);
  });

  it('stops moving the board once stopped', async () => {
    const { motion, calls } = setup();
    await settle();
    motion.stop();
    calls.length = 0;
    motion.goTo(3);
    await settle();
    expect(calls).toEqual([]);
  });
});

describe('autoplay', () => {
  it('plays the first move after the lead and then a move every step', async () => {
    const { motion, steps, playing } = setup();
    motion.play(LEAD_MS);
    expect(playing).toEqual([true]);
    await vi.advanceTimersByTimeAsync(LEAD_MS + ARROW_MS + 10);
    expect(steps.at(-1)).toBe(1);
    await vi.advanceTimersByTimeAsync(STEP_MS);
    expect(steps.at(-1)).toBe(2);
    await vi.advanceTimersByTimeAsync(STEP_MS);
    expect(steps.at(-1)).toBe(3);
  });

  it('plays to the end once and then reports it has stopped', async () => {
    const { motion, steps, playing, now } = setup();
    motion.play();
    await settle();
    expect(steps.at(-1)).toBe(best.steps.length);
    expect(now()).toBe(fenAt(best, best.steps.length));
    expect(playing).toEqual([true, false]);
  });

  it('stops at a tap on the arrows and does not take the next move on its own', async () => {
    const { motion, steps, playing } = setup();
    motion.play(LEAD_MS);
    await vi.advanceTimersByTimeAsync(LEAD_MS + ARROW_MS + 10);
    motion.goTo(motion.heading + 1);
    await settle();
    expect(playing).toEqual([true, false]);
    expect(steps.at(-1)).toBe(2);
  });

  it('is stopped by going back too', async () => {
    const { motion, steps } = setup();
    motion.play();
    await vi.advanceTimersByTimeAsync(ARROW_MS + STEP_MS * 2);
    motion.goTo(motion.heading - 1);
    await settle();
    expect(steps.at(-1)).toBeLessThan(best.steps.length);
  });

  it('replays from the start, ending where it ended before', async () => {
    const { motion, steps, now, playing } = setup();
    motion.play();
    await settle();
    motion.replay();
    await settle();
    expect(now()).toBe(fenAt(best, best.steps.length));
    expect(steps).toContain(0);
    expect(playing).toEqual([true, false, true, false]);
  });

  it('plays through a mistake and on into the best line in one go', async () => {
    const { motion, now, steps } = setup(withMistake);
    motion.play();
    await settle();
    expect(steps.at(-1)).toBe(withMistake.steps.length);
    expect(now()).toBe(fenAt(withMistake, withMistake.steps.length));
  });

  it('does nothing once stopped', async () => {
    const { motion, playing } = setup();
    motion.stop();
    motion.play();
    await settle();
    expect(playing).toEqual([]);
  });
});

describe('controlState', () => {
  const total = best.steps.length;

  it('disables previous at the start and next at the end', () => {
    expect(controlState(best, 0, false)).toMatchObject({ prevDisabled: true, nextDisabled: false });
    expect(controlState(best, 2, false)).toMatchObject({ prevDisabled: false, nextDisabled: false });
    expect(controlState(best, total, false)).toMatchObject({ prevDisabled: false, nextDisabled: true });
  });

  it('pulses next only when nothing is playing and moves remain', () => {
    expect(controlState(best, 2, false).pulseNext).toBe(true);
    expect(controlState(best, 2, true).pulseNext).toBe(false);
    expect(controlState(best, total, false).pulseNext).toBe(false);
  });
});
