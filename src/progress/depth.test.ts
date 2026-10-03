import { describe, expect, it } from 'vitest';
import type { Depth, MomentResult } from '../content/types';
import { WINDOW_SIZE, applyMoment, newDepthState, type DepthState } from './depth';
import { moment, wrong } from './testkit';

function pause(i: number, held: boolean, depth: Depth = 1): MomentResult {
  return (held ? moment : wrong)({ ply: i * 2 + 1, depth });
}

function feed(start: DepthState, results: boolean[], depth: Depth = 1) {
  let state = start;
  let changed: Depth | undefined;
  results.forEach((held, i) => {
    const step = applyMoment(state, pause(i, held, depth));
    state = step.state;
    changed = step.changed ?? changed;
  });
  return { state, changed };
}

const mix = (held: number, total = WINDOW_SIZE) => [...Array(held).fill(true), ...Array(total - held).fill(false)];

describe('depth rules', () => {
  it('waits for a full window before judging', () => {
    const { state, changed } = feed(newDepthState(), Array(19).fill(true));
    expect(changed).toBeUndefined();
    expect(state.depth).toBe(1);
    expect(state.window).toHaveLength(19);
  });

  it('moves up at 15 of 20 and resets the window', () => {
    const { state, changed } = feed(newDepthState(), mix(15));
    expect(changed).toBe(2);
    expect(state).toEqual({ depth: 2, window: [] });
  });

  it('stays put at 14 of 20', () => {
    const { state, changed } = feed({ depth: 3, window: [] }, mix(14), 3);
    expect(changed).toBeUndefined();
    expect(state.depth).toBe(3);
  });

  it('moves down below 10 of 20 and stays at 10', () => {
    expect(feed({ depth: 3, window: [] }, mix(9), 3).state.depth).toBe(2);
    expect(feed({ depth: 3, window: [] }, mix(10), 3).state.depth).toBe(3);
  });

  it('never goes below 1 or above 5', () => {
    expect(feed(newDepthState(), mix(0)).state.depth).toBe(1);
    expect(feed({ depth: 5, window: [] }, mix(20), 5).state.depth).toBe(5);
  });

  it('only looks at the last 20 pauses', () => {
    const { changed } = feed(newDepthState(), [...mix(0, 10), ...mix(15)]);
    expect(changed).toBe(2);
  });

  it('counts a replayed moment once, by its latest result', () => {
    let state = applyMoment(newDepthState(), wrong({ ply: 7 })).state;
    state = applyMoment(state, moment({ ply: 7 })).state;
    expect(state.window).toEqual([{ key: 'italian-1400-0001:7', held: true }]);
  });

  it('holds when the last outcome is correct', () => {
    const m = moment({ outcomes: [{ step: 'spot', correct: false }, { step: 'find', correct: true }] });
    expect(applyMoment(newDepthState(), m).state.window[0].held).toBe(true);
  });

  it('ignores quiet moments, silent finds and other depths', () => {
    const state = newDepthState();
    expect(applyMoment(state, moment({ type: 'nothing' })).state).toBe(state);
    expect(applyMoment(state, moment({ type: 'silent' })).state).toBe(state);
    expect(applyMoment(state, moment({ depth: 2 })).state).toBe(state);
  });
});
