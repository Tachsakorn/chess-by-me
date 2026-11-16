/**
 * Chess sounds made by this project, in code, with the Web Audio API (owner, 2026-11-16): no
 * sound file from anywhere else (docs/STACK.md). Every sound is a few short sine tones that die
 * away fast plus a tick of filtered noise, which together sound like a wooden piece set down on
 * a wooden board.
 *
 * The owner chose style A "solid wood" from three on a test page (2026-11-16): dense wood, low
 * and short, like a heavy piece set down on a thick board. The scheduling takes any
 * BaseAudioContext, so the same code plays in the page and renders offline (to measure it).
 */

/** What happened on the board. Promotion and the end of the game share `end` (owner). */
export type SoundKind = 'move' | 'capture' | 'check' | 'end';

/** One sine partial: frequency as a multiple of the base, its level, and how fast it dies (s). */
interface Partial {
  ratio: number;
  level: number;
  decay: number;
}

/** The tick of the impact: noise through a filter, very short. */
interface Tick {
  type: BiquadFilterType;
  frequency: number;
  q: number;
  level: number;
  decay: number;
}

interface Voice {
  /** Base frequency of one knock (Hz). */
  base: number;
  /** How far the pitch falls in the first moments of a knock (a fraction of the base). */
  drop: number;
  partials: Partial[];
  tick: Tick;
  /** Overall level of the voice. */
  trim: number;
}

const VOICE: Voice = {
  base: 196,
  drop: 0.06,
  partials: [
    { ratio: 1, level: 1, decay: 0.075 },
    { ratio: 2.32, level: 0.42, decay: 0.045 },
    { ratio: 3.86, level: 0.2, decay: 0.028 },
  ],
  tick: { type: 'bandpass', frequency: 1300, q: 1.1, level: 0.55, decay: 0.012 },
  trim: 1,
};

/** One knock inside a sound: when (s after the start), pitch (× base), level, decay (× voice). */
interface Knock {
  at: number;
  pitch: number;
  level: number;
  ring: number;
}

/**
 * The shape of each kind:
 * - move: one knock.
 * - capture: a light knock, then a heavier, lower one (the piece meets the piece, then the board).
 * - check: a knock, then a higher one right after it.
 * - end (and promotion): three knocks rising like a chord, ringing longer.
 */
const KINDS: Record<SoundKind, Knock[]> = {
  move: [{ at: 0, pitch: 1, level: 1, ring: 1 }],
  capture: [
    { at: 0, pitch: 1.08, level: 0.5, ring: 0.8 },
    { at: 0.045, pitch: 0.88, level: 1.1, ring: 1.1 },
  ],
  check: [
    { at: 0, pitch: 1, level: 0.95, ring: 1 },
    { at: 0.085, pitch: 1.5, level: 0.7, ring: 1.2 },
  ],
  end: [
    { at: 0, pitch: 1, level: 0.8, ring: 1.8 },
    { at: 0.11, pitch: 1.26, level: 0.75, ring: 1.8 },
    { at: 0.22, pitch: 1.5, level: 0.8, ring: 2.6 },
  ],
};

/** Silence is not 0 for an exponential ramp. */
const QUIET = 0.0001;
const ATTACK = 0.002;

// The same noise every time (a fixed seed), so a sound is exactly the same at every play.
const noiseBuffers = new WeakMap<BaseAudioContext, AudioBuffer>();
function noise(context: BaseAudioContext): AudioBuffer {
  let buffer = noiseBuffers.get(context);
  if (buffer) return buffer;
  buffer = context.createBuffer(1, Math.ceil(context.sampleRate * 0.1), context.sampleRate);
  const data = buffer.getChannelData(0);
  let seed = 0x2f6b1d;
  for (let i = 0; i < data.length; i++) {
    // xorshift32
    seed ^= seed << 13;
    seed ^= seed >>> 17;
    seed ^= seed << 5;
    data[i] = ((seed >>> 0) / 0xffffffff) * 2 - 1;
  }
  noiseBuffers.set(context, buffer);
  return buffer;
}

function envelope(context: BaseAudioContext, start: number, level: number, decay: number) {
  const gain = context.createGain();
  gain.gain.setValueAtTime(0, start);
  gain.gain.linearRampToValueAtTime(level, start + ATTACK);
  gain.gain.exponentialRampToValueAtTime(QUIET, start + ATTACK + decay);
  return gain;
}

function knock(
  context: BaseAudioContext,
  out: AudioNode,
  voice: Voice,
  start: number,
  { pitch, level, ring }: Knock,
) {
  const base = voice.base * pitch;
  for (const partial of voice.partials) {
    const frequency = base * partial.ratio;
    const decay = partial.decay * ring;
    const oscillator = context.createOscillator();
    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(frequency * (1 + voice.drop), start);
    oscillator.frequency.exponentialRampToValueAtTime(frequency, start + 0.02);
    const gain = envelope(context, start, partial.level * level * voice.trim * 0.3, decay);
    oscillator.connect(gain).connect(out);
    oscillator.start(start);
    oscillator.stop(start + ATTACK + decay + 0.02);
  }
  const { tick } = voice;
  const source = context.createBufferSource();
  source.buffer = noise(context);
  const filter = context.createBiquadFilter();
  filter.type = tick.type;
  filter.frequency.value = tick.frequency * Math.sqrt(pitch);
  filter.Q.value = tick.q;
  const gain = envelope(context, start, tick.level * level * voice.trim * 0.3, tick.decay);
  source.connect(filter).connect(gain).connect(out);
  source.start(start);
  source.stop(start + ATTACK + tick.decay + 0.02);
}

/** Schedules one sound into `out`, starting at `start` (the context's time). */
export function playSound(
  context: BaseAudioContext,
  out: AudioNode,
  kind: SoundKind,
  start = context.currentTime,
) {
  for (const k of KINDS[kind]) knock(context, out, VOICE, start + k.at, k);
}

/**
 * The end of the chain every sound goes through: the volume, then a gentle low-pass so nothing
 * is sharp, then a limiter so two sounds at once never clip.
 */
export function createOutput(context: BaseAudioContext, volume: number) {
  const gain = context.createGain();
  gain.gain.value = volumeGain(volume);
  const soften = context.createBiquadFilter();
  soften.type = 'lowpass';
  soften.frequency.value = 6000;
  soften.Q.value = 0.5;
  const limiter = context.createDynamicsCompressor();
  limiter.threshold.value = -3;
  limiter.knee.value = 0;
  limiter.ratio.value = 20;
  limiter.attack.value = 0.001;
  limiter.release.value = 0.05;
  gain.connect(soften).connect(limiter).connect(context.destination);
  return gain;
}

/** 0-100 as the ear hears it: the square of the fraction. */
export function volumeGain(volume: number): number {
  const fraction = Math.min(Math.max(volume, 0), 100) / 100;
  return fraction * fraction;
}
