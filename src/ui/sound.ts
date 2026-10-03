import { getSettings } from '../progress/store';

/** Chimes for answers and rewards. */
export type SoundKind = 'step' | 'move' | 'silent' | 'levelup' | 'wrong' | 'end';
/** Wooden knocks for pieces landing on the board. */
export type MoveSound = 'piece' | 'capture' | 'check' | 'castle' | 'promote';

export interface Voice {
  /** Frequencies in Hz, one per note. */
  notes: number[];
  /** Seconds between note starts; 0 plays the notes together as a chord. */
  gap: number;
  /** Seconds each note rings. */
  length: number;
  gain: number;
  wave: OscillatorType;
  /** The note slides down to this frequency, for the soft thud. */
  slideTo?: number;
}

/** One knock: a short burst of filtered noise on top of a low thump. */
export interface Hit {
  /** Seconds after the sound starts. */
  at: number;
  /** Centre of the noise band in Hz. */
  band: number;
  /** Pitch of the thump in Hz. */
  thump: number;
  gain: number;
}

export interface Knock {
  hits: Hit[];
  /** A tonal tail after the knock: the ping of a check, the rise of a promotion. */
  ring?: { voice: Voice; delay: number };
}

const C5 = 523.25;
const E5 = 659.25;
const G5 = 783.99;
const A5 = 880;
const C6 = 1046.5;
const G6 = 1568;

export const VOICES: Record<SoundKind, Voice> = {
  step: { notes: [E5, A5], gap: 0.07, length: 0.16, gain: 0.1, wave: 'sine' },
  move: { notes: [C5, E5, G5], gap: 0.065, length: 0.2, gain: 0.11, wave: 'triangle' },
  silent: { notes: [C5, E5, G5, C6], gap: 0.06, length: 0.22, gain: 0.11, wave: 'triangle' },
  levelup: { notes: [C5, E5, G5, C6], gap: 0, length: 0.8, gain: 0.07, wave: 'triangle' },
  wrong: { notes: [150], gap: 0, length: 0.18, gain: 0.12, wave: 'sine', slideTo: 70 },
  end: { notes: [C5, E5, G5], gap: 0, length: 0.9, gain: 0.06, wave: 'sine' },
};

const TOCK: Hit = { at: 0, band: 1800, thump: 180, gain: 0.9 };

export const KNOCKS: Record<MoveSound, Knock> = {
  piece: { hits: [TOCK] },
  capture: {
    hits: [
      { at: 0, band: 1300, thump: 140, gain: 1 },
      { at: 0.03, band: 1000, thump: 120, gain: 0.9 },
    ],
  },
  check: { hits: [TOCK], ring: { voice: { notes: [G6], gap: 0, length: 0.16, gain: 0.05, wave: 'sine' }, delay: 0.04 } },
  castle: { hits: [TOCK, { at: 0.09, band: 1500, thump: 150, gain: 0.9 }] },
  promote: {
    hits: [TOCK],
    ring: { voice: { notes: [G5, C6], gap: 0.07, length: 0.18, gain: 0.07, wave: 'triangle' }, delay: 0.06 },
  },
};

export type Sound = SoundKind | MoveSound;

const NOISE_SECONDS = 0.03;
// A late chime is worse than none, so a sound waiting for the unlock is dropped after this long.
const STALE_MS = 600;
const UNLOCK_EVENTS = ['touchend', 'click', 'keydown'] as const;

let context: AudioContext | null = null;
let noise: AudioBuffer | null = null;

function audio(): AudioContext | null {
  if (context) return context;
  if (typeof AudioContext === 'undefined') return null;
  context = new AudioContext();
  context.addEventListener('statechange', listenForUnlock);
  return context;
}

/** Playing an empty buffer inside a gesture is what makes iOS release the audio output. */
function playSilence(ctx: AudioContext): void {
  const source = ctx.createBufferSource();
  source.buffer = ctx.createBuffer(1, 1, 22050);
  source.connect(ctx.destination);
  source.start(0);
}

/** iOS keeps audio locked until a touchend, click or key press creates or resumes the context. */
export function unlockAudio(): void {
  const ctx = audio();
  if (!ctx) return;
  playSilence(ctx);
  if (ctx.state === 'running') {
    stopListeningForUnlock();
    return;
  }
  ctx.resume().then(() => ctx.state === 'running' && stopListeningForUnlock(), () => {});
}

function listenForUnlock(): void {
  if (context?.state === 'running') return;
  for (const type of UNLOCK_EVENTS) window.addEventListener(type, unlockAudio, { capture: true, passive: true });
}

function stopListeningForUnlock(): void {
  for (const type of UNLOCK_EVENTS) window.removeEventListener(type, unlockAudio, { capture: true });
}

if (typeof window !== 'undefined') listenForUnlock();

function envelope(ctx: AudioContext, start: number, attack: number, length: number, peak: number): GainNode {
  const amp = ctx.createGain();
  amp.gain.setValueAtTime(0.0001, start);
  amp.gain.exponentialRampToValueAtTime(peak, start + attack);
  amp.gain.exponentialRampToValueAtTime(0.0001, start + length);
  return amp;
}

function ring(ctx: AudioContext, freq: number, start: number, voice: Voice): void {
  const osc = ctx.createOscillator();
  const end = start + voice.length;
  osc.type = voice.wave;
  osc.frequency.setValueAtTime(freq, start);
  if (voice.slideTo) osc.frequency.exponentialRampToValueAtTime(voice.slideTo, end);
  osc.connect(envelope(ctx, start, 0.012, voice.length, voice.gain)).connect(ctx.destination);
  osc.start(start);
  osc.stop(end + 0.02);
}

function noiseBuffer(ctx: AudioContext): AudioBuffer {
  if (noise) return noise;
  noise = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * NOISE_SECONDS), ctx.sampleRate);
  const samples = noise.getChannelData(0);
  for (let i = 0; i < samples.length; i++) samples[i] = Math.random() * 2 - 1;
  return noise;
}

function hit(ctx: AudioContext, start: number, { band, thump, gain }: Hit): void {
  const burst = ctx.createBufferSource();
  const filter = ctx.createBiquadFilter();
  burst.buffer = noiseBuffer(ctx);
  filter.type = 'bandpass';
  filter.frequency.value = band;
  filter.Q.value = 1.2;
  burst.connect(filter).connect(envelope(ctx, start, 0.002, NOISE_SECONDS, gain)).connect(ctx.destination);
  burst.start(start);

  const body = ctx.createOscillator();
  body.frequency.setValueAtTime(thump * 1.3, start);
  body.frequency.exponentialRampToValueAtTime(thump, start + 0.04);
  body.connect(envelope(ctx, start, 0.003, 0.06, gain * 0.5)).connect(ctx.destination);
  body.start(start);
  body.stop(start + 0.08);
}

function playVoice(ctx: AudioContext, voice: Voice, start: number, rate: number): void {
  voice.notes.forEach((freq, i) => ring(ctx, freq * rate, start + i * voice.gap, voice));
}

function isKnock(kind: Sound): kind is MoveSound {
  return kind in KNOCKS;
}

function render(ctx: AudioContext, kind: Sound, semitones: number): void {
  const start = ctx.currentTime;
  if (!isKnock(kind)) {
    playVoice(ctx, VOICES[kind], start, 2 ** (semitones / 12));
    return;
  }
  const { hits, ring } = KNOCKS[kind];
  for (const h of hits) hit(ctx, start + h.at, h);
  if (ring) playVoice(ctx, ring.voice, start + ring.delay, 1);
}

/** Positive `semitones` raise the pitch; stars use it to climb. */
export function playSound(kind: Sound, semitones = 0): void {
  if (!getSettings().sound) return;
  const ctx = audio();
  if (!ctx) return;
  if (ctx.state === 'running') {
    render(ctx, kind, semitones);
    return;
  }
  const asked = performance.now();
  ctx.resume().then(
    () => ctx.state === 'running' && performance.now() - asked < STALE_MS && render(ctx, kind, semitones),
    () => {},
  );
}
