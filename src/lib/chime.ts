"use client";

/**
 * The sound a notification makes.
 *
 * Synthesised rather than played from a file, on purpose. An mp3 is one more
 * thing that can 404 behind deployment protection, one more request that has
 * to finish before the sound lands, and one more asset to keep in the repo —
 * and this is two sine tones. Nothing to fetch means it is never late and
 * never silently missing.
 *
 * Two voices, because not everything deserves the same volume:
 *
 *   soft  — something happened and you'd like to know. One low note.
 *   ask   — somebody is waiting on YOU. Two notes, rising, a touch louder.
 *
 * Kept deliberately quiet. This plays in a room of designers wearing
 * headphones; a doorbell would get the whole feature switched off within a
 * day, which is the same as not having built it.
 */

const ENABLED_KEY = "neuroid.notification-sound";

export type ChimeVoice = "soft" | "ask";

/** Frequencies in Hz, and how long each note holds. A perfect fifth apart. */
const VOICES: Record<ChimeVoice, { notes: number[]; hold: number; peak: number }> = {
  soft: { notes: [660], hold: 0.16, peak: 0.05 },
  ask: { notes: [660, 990], hold: 0.15, peak: 0.075 },
};

export function soundSupported(): boolean {
  return typeof window !== "undefined" && "AudioContext" in window;
}

/**
 * On by default.
 *
 * The whole reason this exists is that a designer in Premiere doesn't see a
 * toast. Defaulting it off would mean the people it was built for never hear
 * it, and switching it off is one click away in Profile.
 */
export function soundPreferred(): boolean {
  try {
    return window.localStorage.getItem(ENABLED_KEY) !== "0";
  } catch {
    return false; // private window — no preference to read, so stay quiet
  }
}

export function setSoundPreferred(on: boolean) {
  try {
    window.localStorage.setItem(ENABLED_KEY, on ? "1" : "0");
  } catch {
    /* private window — the toggle just won't persist */
  }
}

let context: AudioContext | null = null;

/**
 * One context for the page.
 *
 * A browser refuses to start audio before the person has interacted with the
 * page, and a context created too early is left `suspended` — so it is created
 * lazily and resumed on the way past. If it is still suspended, the sound is
 * dropped rather than queued: a chime that arrives four minutes late, when
 * somebody finally clicks something, is worse than silence.
 */
function audio(): AudioContext | null {
  if (!soundSupported()) return null;
  try {
    context ??= new AudioContext();
    if (context.state === "suspended") void context.resume();
    return context;
  } catch {
    return null;
  }
}

/**
 * Unlock the audio context from a real gesture.
 *
 * Called from the click that turns the sound on, so the first real
 * notification isn't the one that discovers the browser won't allow it.
 */
export function primeSound() {
  const ctx = audio();
  if (ctx && ctx.state === "suspended") void ctx.resume();
}

/**
 * Play one. Returns false when nothing was heard, so a test button can tell
 * the difference between "played" and "the browser refused".
 */
export function chime(voice: ChimeVoice = "soft", force = false): boolean {
  if (!force && !soundPreferred()) return false;

  const ctx = audio();
  if (!ctx || ctx.state !== "running") return false;

  const { notes, hold, peak } = VOICES[voice];

  try {
    notes.forEach((frequency, index) => {
      const start = ctx.currentTime + index * (hold * 0.72);
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      // A sine with a soft envelope. A square wave or a hard start is what
      // makes a notification sound like an error.
      osc.type = "sine";
      osc.frequency.setValueAtTime(frequency, start);

      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(peak, start + 0.012);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + hold);

      osc.connect(gain).connect(ctx.destination);
      osc.start(start);
      osc.stop(start + hold + 0.02);
    });
    return true;
  } catch {
    return false;
  }
}
