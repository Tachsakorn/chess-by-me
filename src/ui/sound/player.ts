/**
 * Plays the app's sounds (owner, 2026-11-16): style A "solid wood" at 70%, the owner's pick from
 * the sound test.
 *
 * - On iPhone and iPad the audio session is "ambient" (where the browser has it, Safari 16.4+):
 *   the silent switch mutes the app, and music the user is playing keeps playing.
 * - Browsers only let sound start after a tap, so the audio is set up at the user's first tap,
 *   key or click (`listenForFirstTap`), never before, and never while sound is off.
 * - The switch in Settings is kept on this device (`cbm.sound`); on unless turned off.
 */
import { createOutput, playSound, type SoundKind } from './synth';

const VOLUME = 70;
const STORAGE_KEY = 'cbm.sound';
/** A sound scheduled at the very moment the output starts plays too quietly (measured offline). */
const LEAD = 0.03;

/** Fired on window for every sound played, so the end-to-end tests can tell which one. */
export const SOUND_EVENT = 'cbm-sound';

let audio: { context: AudioContext; out: GainNode } | null = null;

export function soundEnabled(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) !== 'off';
  } catch {
    return true;
  }
}

export function setSoundEnabled(on: boolean) {
  try {
    localStorage.setItem(STORAGE_KEY, on ? 'on' : 'off');
  } catch {
    // Storage blocked: the switch still works until the page is closed.
  }
  enabledNow = on;
  if (!on) void audio?.context.suspend();
}

let enabledNow: boolean | null = null;
const enabled = () => (enabledNow ??= soundEnabled());

interface AudioSession {
  type: string;
}

/** Sets the audio up, or wakes it after the system stopped it. Only from a tap. */
function wake() {
  if (!enabled() || typeof AudioContext === 'undefined') return;
  if (!audio) {
    const session = (navigator as Navigator & { audioSession?: AudioSession }).audioSession;
    if (session) session.type = 'ambient';
    const context = new AudioContext();
    audio = { context, out: createOutput(context, VOLUME) };
  }
  if (audio.context.state !== 'running') void audio.context.resume();
}

/** Called once when the app starts: every tap, key or click may set up or wake the audio. */
export function listenForFirstTap() {
  for (const type of ['pointerup', 'touchend', 'keydown', 'click']) {
    window.addEventListener(type, wake, { capture: true, passive: true });
  }
}

/** Plays one sound now, if sound is on. */
export function playMoveSound(kind: SoundKind) {
  if (!enabled()) return;
  wake();
  if (!audio) return;
  try {
    playSound(audio.context, audio.out, kind, audio.context.currentTime + LEAD);
  } catch {
    return; // a sound is never worth an error on screen
  }
  window.dispatchEvent(new CustomEvent(SOUND_EVENT, { detail: kind }));
}
