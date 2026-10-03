import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type Listener = () => void;

class FakeContext {
  state = 'suspended';
  currentTime = 0;
  sampleRate = 44100;
  destination = {};
  oscillators = 0;
  buffers = 0;
  resumes = 0;

  createGain() {
    const param = { setValueAtTime() {}, exponentialRampToValueAtTime() {} };
    return { gain: param, connect: (next: unknown) => next };
  }
  createOscillator() {
    this.oscillators++;
    const param = { setValueAtTime() {}, exponentialRampToValueAtTime() {} };
    return { type: '', frequency: param, connect: (next: unknown) => next, start() {}, stop() {} };
  }
  createBiquadFilter() {
    return { type: '', frequency: { value: 0 }, Q: { value: 0 }, connect: (next: unknown) => next };
  }
  createBufferSource() {
    this.buffers++;
    return { buffer: null, connect: (next: unknown) => next, start() {} };
  }
  createBuffer(_channels: number, length: number) {
    return { getChannelData: () => new Float32Array(length) };
  }
  addEventListener() {}
  async resume() {
    this.resumes++;
    this.state = 'running';
  }
}

let contexts: FakeContext[];
let listening: Map<string, Listener>;

async function loadSound() {
  vi.resetModules();
  return import('./sound');
}

beforeEach(() => {
  contexts = [];
  listening = new Map();
  vi.stubGlobal('window', {
    addEventListener: (type: string, listener: Listener) => listening.set(type, listener),
    removeEventListener: (type: string) => listening.delete(type),
  });
  vi.stubGlobal(
    'AudioContext',
    class extends FakeContext {
      constructor() {
        super();
        contexts.push(this);
      }
    },
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('unlocking audio', () => {
  it('listens for touchend, click and key presses, but not pointerdown', async () => {
    await loadSound();
    expect([...listening.keys()].sort()).toEqual(['click', 'keydown', 'touchend']);
  });

  it('plays one silent buffer, resumes, and stops listening once running', async () => {
    const { unlockAudio } = await loadSound();
    unlockAudio();
    await Promise.resolve();
    await Promise.resolve();
    expect(contexts).toHaveLength(1);
    expect(contexts[0].buffers).toBe(1);
    expect(contexts[0].resumes).toBe(1);
    expect(listening.size).toBe(0);
  });
});

describe('playing sounds', () => {
  it('does not drop a sound asked for while the context is still locked', async () => {
    const { playSound, unlockAudio } = await loadSound();
    unlockAudio();
    contexts[0].state = 'suspended';
    playSound('piece');
    await new Promise((resolve) => setTimeout(resolve));
    expect(contexts[0].oscillators).toBe(1);
    expect(contexts[0].buffers).toBe(2);
  });

  it('plays two knocks for a capture and a chord of three for the end', async () => {
    const { playSound, unlockAudio } = await loadSound();
    unlockAudio();
    await Promise.resolve();
    const [ctx] = contexts;
    playSound('capture');
    expect(ctx.oscillators).toBe(2);
    ctx.oscillators = 0;
    playSound('end');
    expect(ctx.oscillators).toBe(3);
  });

  it('stays silent when sound is off', async () => {
    const { playSound, unlockAudio } = await loadSound();
    const store = await import('../progress/store');
    unlockAudio();
    await Promise.resolve();
    store.saveSettings({ ...store.getSettings(), sound: false });
    playSound('piece');
    expect(contexts[0].oscillators).toBe(0);
  });
});

describe('knocks', () => {
  it('gives the piece knock a noise band near 1.8 kHz over a thump near 180 Hz', async () => {
    const { KNOCKS } = await loadSound();
    expect(KNOCKS.piece.hits).toEqual([expect.objectContaining({ at: 0, band: 1800, thump: 180 })]);
  });

  it('makes a capture two lower tocks 30 ms apart', async () => {
    const { KNOCKS } = await loadSound();
    const [first, second] = KNOCKS.capture.hits;
    expect(second.at - first.at).toBeCloseTo(0.03);
    expect(first.band).toBeLessThan(KNOCKS.piece.hits[0].band);
    expect(first.thump).toBeLessThan(KNOCKS.piece.hits[0].thump);
  });

  it('adds a high ping to a check and a rising pair to a promotion', async () => {
    const { KNOCKS } = await loadSound();
    expect(KNOCKS.check.ring!.voice.notes[0]).toBeGreaterThan(1000);
    const [low, high] = KNOCKS.promote.ring!.voice.notes;
    expect(high).toBeGreaterThan(low);
    expect(KNOCKS.castle.hits).toHaveLength(2);
  });
});
