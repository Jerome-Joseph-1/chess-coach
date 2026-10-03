import { describe, expect, it } from 'vitest';
import type { BoardController } from '../board/types';
import { isOffHome, lineData, LineMotion, moveNumbers } from './lineMotion';
import { revealLines } from './lines';
import { fenAfter, samePosition } from './position';
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
  } as unknown as BoardController;
  return { board, calls, now: () => fen, overlapped: () => overlapped };
}

const turn = italian1.turns[7];
const lineOf = (id: string) => {
  const line = revealLines(italian1, 7).find((l) => l.id === id)!;
  return lineData(line.fen, line.moves);
};
const [threat, best, mistake] = [lineOf('threat'), lineOf('best'), lineOf('mistake')];

function setup(line = best) {
  const fake = fakeBoard(turn.fen);
  const steps: number[] = [];
  const motion = new LineMotion(fake.board, turn.fen, (n) => steps.push(n));
  motion.setLine(line);
  return { ...fake, motion, steps };
}

describe('LineMotion', () => {
  it('shows the start of a line when it is set, without playing moves', async () => {
    const { motion, calls, steps } = setup();
    await motion.settled();
    expect(calls).toEqual([`set ${turn.fen}`]);
    expect(steps).toEqual([0]);
  });

  it('plays moves forward one by one with playMove', async () => {
    const { motion, calls, now, steps } = setup();
    await motion.settled();
    calls.length = 0;
    motion.goTo(3);
    await motion.settled();
    expect(calls).toEqual(best.played.slice(0, 3).map((m) => `play ${m.uci}`));
    expect(steps.slice(-3)).toEqual([1, 2, 3]);
    expect(now()).toBe(best.fens[3]);
  });

  it('goes back with setPosition', async () => {
    const { motion, calls, now } = setup();
    motion.goTo(4);
    await motion.settled();
    calls.length = 0;
    motion.goTo(1);
    await motion.settled();
    expect(calls).toEqual([`set ${best.fens[1]}`]);
    expect(now()).toBe(best.fens[1]);
  });

  it('queues quick taps instead of overlapping animations', async () => {
    const { motion, now, overlapped, steps } = setup();
    for (let i = 0; i < 4; i++) motion.goTo(motion.heading + 1);
    await motion.settled();
    expect(overlapped()).toBe(false);
    expect(now()).toBe(best.fens[4]);
    expect(steps.at(-1)).toBe(4);
  });

  it('stays inside the line', async () => {
    const { motion, now } = setup();
    motion.goTo(99);
    await motion.settled();
    expect(now()).toBe(best.fens.at(-1));
    motion.goTo(-5);
    await motion.settled();
    expect(now()).toBe(best.fens[0]);
  });

  it('resets to the start of the new line when the line is switched', async () => {
    const { motion, now, steps } = setup();
    motion.goTo(3);
    await motion.settled();
    motion.setLine(mistake);
    await motion.settled();
    expect(now()).toBe(mistake.fens[0]);
    expect(steps.at(-1)).toBe(0);
    motion.goTo(1);
    await motion.settled();
    expect(now()).toBe(mistake.fens[1]);
  });

  it('copes with a line switch while a move is still animating', async () => {
    const { motion, now, steps } = setup();
    await motion.settled();
    motion.goTo(3);
    await new Promise((resolve) => setTimeout(resolve, 2));
    motion.setLine(mistake);
    await motion.settled();
    expect(now()).toBe(mistake.fens[0]);
    expect(steps.at(-1)).toBe(0);
    motion.goTo(2);
    await motion.settled();
    expect(now()).toBe(mistake.fens[2]);
  });

  it('starts the threat line from the flipped position and returns to the real one', async () => {
    const { motion, now, calls } = setup(threat);
    await motion.settled();
    expect(now()).toBe(threat.fens[0]);
    expect(threat.fens[0]).not.toBe(turn.fen);
    expect(samePosition(now(), turn.fen)).toBe(false);

    motion.goTo(2);
    await motion.settled();
    calls.length = 0;
    motion.backToPosition();
    await motion.settled();
    expect(now()).toBe(turn.fen);
    expect(calls).toEqual([`set ${threat.fens[0]}`, `set ${turn.fen}`]);
  });

  it('plays on from the real position after coming back', async () => {
    const { motion, now } = setup(threat);
    motion.goTo(1);
    await motion.settled();
    motion.backToPosition();
    await motion.settled();
    motion.goTo(1);
    await motion.settled();
    expect(now()).toBe(threat.fens[1]);
  });

  it('returns from a best line step to the start position', async () => {
    const { motion, now, steps } = setup();
    motion.goTo(3);
    await motion.settled();
    motion.backToPosition();
    await motion.settled();
    expect(now()).toBe(turn.fen);
    expect(steps.at(-1)).toBe(0);
  });

  it('stops moving the board once stopped', async () => {
    const { motion, calls } = setup();
    await motion.settled();
    motion.stop();
    calls.length = 0;
    motion.goTo(3);
    await motion.settled();
    expect(calls).toEqual([]);
  });
});

describe('isOffHome', () => {
  it('ignores the side to move, so the threat start is still home', () => {
    expect(isOffHome(threat.fens[0], turn.fen)).toBe(false);
    expect(isOffHome(threat.fens[1], turn.fen)).toBe(true);
    expect(isOffHome(best.fens[0], turn.fen)).toBe(false);
    expect(isOffHome(best.fens[2], turn.fen)).toBe(true);
  });
});

describe('moveNumbers', () => {
  it('numbers White moves and marks a Black opening move', () => {
    expect(moveNumbers(best.fens[0], best.played)).toEqual(['11.', '', '12.', '', '13.', '']);
    expect(moveNumbers(threat.fens[0], threat.played)).toEqual(['11…', '12.']);
  });
});
