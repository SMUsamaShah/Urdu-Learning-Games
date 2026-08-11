/**
 * Interface sounds, synthesised rather than loaded.
 *
 * Taps, pops and chimes are a few oscillators and an envelope, so there is no
 * reason to ship audio files for them: nothing to license, nothing to download,
 * nothing to keep in sync with the manifest. It also keeps every file under
 * public/audio/ a human voice, which is the only audio worth a person's time to
 * record.
 *
 * Kept deliberately soft. This is played at a child's ear, often repeatedly.
 */

/** @type {AudioContext|null} */
let ctx = null;
/** @type {GainNode|null} */
let master = null;

export function initSfx(game) {
  ctx = game?.sound?.context ?? null;
  if (!ctx) return;
  master = ctx.createGain();
  master.gain.value = 0.32;
  master.connect(ctx.destination);
}

/**
 * One enveloped oscillator.
 *
 * The envelope matters more than the waveform: an abrupt start or stop on a
 * sine produces an audible click, so every tone ramps in and decays out.
 */
function tone({ freq, endFreq, start = 0, duration, type = 'sine', gain = 1 }) {
  if (!ctx || !master) return;
  const t0 = ctx.currentTime + start;
  const osc = ctx.createOscillator();
  const env = ctx.createGain();

  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  if (endFreq) osc.frequency.exponentialRampToValueAtTime(endFreq, t0 + duration);

  env.gain.setValueAtTime(0.0001, t0);
  env.gain.exponentialRampToValueAtTime(gain, t0 + Math.min(0.02, duration / 4));
  env.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);

  osc.connect(env);
  env.connect(master);
  osc.start(t0);
  osc.stop(t0 + duration + 0.02);
}

/** A soft blip for any successful tap. */
export function tap() {
  tone({ freq: 660, endFreq: 880, duration: 0.09, gain: 0.5 });
}

/** Balloon pop: a short noisy thud with a quick downward chirp. */
export function pop() {
  tone({ freq: 900, endFreq: 220, duration: 0.14, type: 'triangle', gain: 0.7 });
  tone({ freq: 180, endFreq: 90, duration: 0.1, type: 'sine', gain: 0.5 });
}

/** Rising third for a right answer. Cheerful without being a fanfare. */
export function correct() {
  tone({ freq: 660, duration: 0.13, gain: 0.55 });
  tone({ freq: 880, start: 0.11, duration: 0.16, gain: 0.55 });
  tone({ freq: 1320, start: 0.22, duration: 0.22, gain: 0.35 });
}

/**
 * For a wrong tap. Deliberately not a buzzer.
 *
 * A three-year-old should be invited to try again, not told off; the app has no
 * fail states, so its sounds should not have one either.
 */
export function nudge() {
  tone({ freq: 320, endFreq: 280, duration: 0.16, type: 'sine', gain: 0.4 });
}

/** Page or scene transition. */
export function swoosh() {
  tone({ freq: 420, endFreq: 720, duration: 0.16, type: 'sine', gain: 0.3 });
}
