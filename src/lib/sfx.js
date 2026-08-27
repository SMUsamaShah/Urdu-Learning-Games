/* Interface sounds, synthesised rather than loaded. */

import { masterOut } from './volume.js';

/** @type {AudioContext|null} */
let ctx = null;
/** @type {GainNode|null} */
let master = null;

/* How loud the effects are, before the app's own volume. */
const SFX_LEVEL = 0.5;

export function initSfx(game) {
  ctx = game?.sound?.context ?? null;
  if (!ctx) return;
  master = ctx.createGain();
  master.gain.value = SFX_LEVEL;
  master.connect(masterOut() ?? ctx.destination);
}

/* One enveloped oscillator. */
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

/* A soft blip for any successful tap. */
export function tap() {
  tone({ freq: 660, endFreq: 880, duration: 0.09, gain: 0.5 });
}

/* Balloon pop: a short noisy thud with a quick downward chirp. */
export function pop() {
  tone({ freq: 900, endFreq: 220, duration: 0.14, type: 'triangle', gain: 0.7 });
  tone({ freq: 180, endFreq: 90, duration: 0.1, type: 'sine', gain: 0.5 });
}

/* Rising third for a right answer. */
export function correct() {
  tone({ freq: 660, duration: 0.13, gain: 0.55 });
  tone({ freq: 880, start: 0.11, duration: 0.16, gain: 0.55 });
  tone({ freq: 1320, start: 0.22, duration: 0.22, gain: 0.35 });
}

/* For a wrong tap. */
export function nudge() {
  tone({ freq: 320, endFreq: 280, duration: 0.16, type: 'sine', gain: 0.4 });
}

/* The bigger one, for finishing a run rather than answering a question. */
export function fanfare() {
  const notes = [523, 659, 784, 1047, 1319];
  notes.forEach((freq, i) =>
    tone({ freq, start: i * 0.11, duration: 0.3, type: 'triangle', gain: 0.45 })
  );
  tone({ freq: 262, duration: 0.75, type: 'sine', gain: 0.22 });
  tone({ freq: 392, duration: 0.75, type: 'sine', gain: 0.18 });
}

/* Page or scene transition. */
export function swoosh() {
  tone({ freq: 420, endFreq: 720, duration: 0.16, type: 'sine', gain: 0.3 });
}

/* A short burst of filtered noise. */
function noise({ start = 0, duration = 0.2, gain = 0.3, from = 6000, to = 400, type = 'bandpass', q = 1 }) {
  if (!ctx || !master) return;
  const t0 = ctx.currentTime + start;
  const frames = Math.max(1, Math.ceil(ctx.sampleRate * duration));
  const buffer = ctx.createBuffer(1, frames, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < frames; i++) data[i] = Math.random() * 2 - 1;

  const source = ctx.createBufferSource();
  source.buffer = buffer;

  // The sweep is what turns white noise into a gesture.
  const filter = ctx.createBiquadFilter();
  filter.type = type;
  filter.Q.value = q;
  filter.frequency.setValueAtTime(from, t0);
  filter.frequency.exponentialRampToValueAtTime(Math.max(60, to), t0 + duration);

  const env = ctx.createGain();
  env.gain.setValueAtTime(0.0001, t0);
  env.gain.exponentialRampToValueAtTime(gain, t0 + 0.01);
  env.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);

  source.connect(filter);
  filter.connect(env);
  env.connect(master);
  source.start(t0);
  source.stop(t0 + duration + 0.02);
}

/* Glitter: a handful of very short high notes at random pitches. */
export function sparkle() {
  for (let i = 0; i < 7; i++) {
    tone({
      freq: 1400 + Math.random() * 1800,
      duration: 0.09 + Math.random() * 0.07,
      start: i * 0.035 + Math.random() * 0.02,
      type: 'sine',
      gain: 0.16,
    });
  }
}

/* Something springing into place. */
export function boing() {
  tone({ freq: 260, endFreq: 620, duration: 0.11, type: 'triangle', gain: 0.3 });
  tone({ freq: 620, endFreq: 480, start: 0.09, duration: 0.1, type: 'sine', gain: 0.2 });
}

/* A card turning over. */
export function flip() {
  noise({ duration: 0.12, gain: 0.22, from: 1200, to: 5200, q: 0.7 });
}

/* Four ticks and a chime, for the run-up to a celebration. */
export function drumroll() {
  for (let i = 0; i < 10; i++) {
    noise({ start: i * 0.045, duration: 0.05, gain: 0.12 + i * 0.012, from: 900, to: 220, q: 1.5 });
  }
  tone({ freq: 1047, start: 0.48, duration: 0.4, type: 'triangle', gain: 0.4 });
}

/* The big one: a rising run with a held chord under it. */
export function tada() {
  const run = [523, 659, 784, 1047];
  run.forEach((freq, i) =>
    tone({ freq, start: i * 0.07, duration: 0.18, type: 'triangle', gain: 0.4 })
  );
  for (const freq of [523, 659, 784, 1047, 1319]) {
    tone({ freq, start: 0.3, duration: 1.1, type: 'triangle', gain: 0.26 });
  }
  tone({ freq: 131, start: 0.3, duration: 1.2, type: 'sine', gain: 0.2 });
  noise({ start: 0.3, duration: 0.9, gain: 0.16, from: 9000, to: 2000, q: 0.5 });
}

/* Water landing on soil, for a pour into the plant pot. */
export function water() {
  for (let i = 0; i < 3; i++) {
    noise({ start: i * 0.06, duration: 0.09, gain: 0.16, from: 2600, to: 700, q: 1.2 });
  }
  tone({ freq: 520, endFreq: 760, start: 0.05, duration: 0.16, type: 'sine', gain: 0.22 });
}

/* A soft whoosh for something crossing the screen. */
export function whoosh() {
  noise({ duration: 0.32, gain: 0.18, from: 400, to: 3600, q: 0.6 });
}
