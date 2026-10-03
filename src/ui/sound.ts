import { getSettings } from '../progress/store';

export type SoundKind = 'step' | 'move' | 'silent' | 'levelup' | 'wrong';

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

const C5 = 523.25;
const E5 = 659.25;
const G5 = 783.99;
const A5 = 880;
const C6 = 1046.5;

export const VOICES: Record<SoundKind, Voice> = {
  step: { notes: [E5, A5], gap: 0.07, length: 0.16, gain: 0.1, wave: 'sine' },
  move: { notes: [C5, E5, G5], gap: 0.065, length: 0.2, gain: 0.11, wave: 'triangle' },
  silent: { notes: [C5, E5, G5, C6], gap: 0.06, length: 0.22, gain: 0.11, wave: 'triangle' },
  levelup: { notes: [C5, E5, G5, C6], gap: 0, length: 0.8, gain: 0.07, wave: 'triangle' },
  wrong: { notes: [150], gap: 0, length: 0.18, gain: 0.2, wave: 'sine', slideTo: 70 },
};

let context: AudioContext | null = null;

function audio(): AudioContext | null {
  if (context) return context;
  if (typeof AudioContext === 'undefined') return null;
  context = new AudioContext();
  return context;
}

/** iOS keeps audio locked until a gesture creates or resumes the context. */
export function unlockAudio(): void {
  const ctx = audio();
  if (ctx?.state === 'suspended') void ctx.resume();
}

if (typeof window !== 'undefined') {
  window.addEventListener('pointerdown', unlockAudio, { once: true, capture: true, passive: true });
}

function ring(ctx: AudioContext, freq: number, start: number, voice: Voice): void {
  const osc = ctx.createOscillator();
  const amp = ctx.createGain();
  const end = start + voice.length;
  osc.type = voice.wave;
  osc.frequency.setValueAtTime(freq, start);
  if (voice.slideTo) osc.frequency.exponentialRampToValueAtTime(voice.slideTo, end);
  amp.gain.setValueAtTime(0.0001, start);
  amp.gain.exponentialRampToValueAtTime(voice.gain, start + 0.012);
  amp.gain.exponentialRampToValueAtTime(0.0001, end);
  osc.connect(amp).connect(ctx.destination);
  osc.start(start);
  osc.stop(end + 0.02);
}

/** Positive `semitones` raise the pitch; stars use it to climb. */
export function playSound(kind: SoundKind, semitones = 0): void {
  if (!getSettings().sound) return;
  const ctx = audio();
  if (!ctx) return;
  if (ctx.state !== 'running') {
    void ctx.resume();
    return;
  }
  const voice = VOICES[kind];
  const rate = 2 ** (semitones / 12);
  voice.notes.forEach((freq, i) => ring(ctx, freq * rate, ctx.currentTime + i * voice.gap, voice));
}
