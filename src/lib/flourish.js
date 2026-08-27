/* Getting something right: the sound of it, and the credit for it. */

import { masterOut } from './volume.js';
import * as mastery from './mastery.js';

import { loadTone, renderedChannels } from './tone-setup.js';
import * as progress from './progress.js';
import * as sfx from './sfx.js';

/* The voice the rewards are played on. */
const INSTRUMENT = 'glockenspiel';

/* C major pentatonic, matching the tune, so a flourish is never a clash. */
const UP = ['C5', 'D5', 'E5', 'G5', 'A5', 'C6'];

let ready = null;
let voice = null;

/* Builds the flourish voice, once, in the background. */
function prepare() {
  ready ??= (async () => {
    const T = await loadTone();
    // Into the app's master rather than Tone's own destination, so the volume setting reaches the celebrations too.
    voice = { T, ...(await buildVoice(T, masterOut() ?? T.getDestination())) };
    return voice;
  })().catch(() => {
    // Keep the fallback available if sampled audio cannot load.
    voice = null;
    return null;
  });
  return ready;
}

/* The sampler and its reverb, built into a destination. */
async function buildVoice(T, destination) {
  // Short and bright.
  const reverb = new T.Reverb({ decay: 1.6, wet: 0.26 });
  reverb.connect(destination);
  await reverb.ready;

  const sampler = new T.Sampler({
    urls: { C4: 'C4.mp3', 'F#4': 'Gb4.mp3', C5: 'C5.mp3', 'F#5': 'Gb5.mp3', C6: 'C6.mp3' },
    baseUrl: `${import.meta.env.BASE_URL}audio/instruments/${INSTRUMENT}/`,
    release: 1.6,
    volume: -6,
  });
  sampler.connect(reverb);
  sampler.connect(destination);
  await T.loaded();

  return { sampler, reverb };
}

/* Plays notes at offsets in seconds from now, if the voice is up. */
function play(notes, fallback) {
  prepare();
  if (!voice) {
    fallback();
    return;
  }
  const { T, sampler } = voice;
  const now = T.now();
  let sounded = 0;
  for (const [note, at, duration, velocity] of notes) {
    try {
      sampler.triggerAttackRelease(note, duration, now + at, velocity);
      sounded++;
    } catch {
      // Ignore late or duplicate triggers.
    }
  }
  if (!sounded) fallback();
}

/* The three flourishes, as [note, seconds from the start, length, velocity]. */
const FLOURISHES = {
  /* One right answer: four notes up the scale with the last one held, plus a fifth above it. */
  rightAnswer() {
    const start = Math.floor(Math.random() * 2);
    return [
      [UP[start], 0, 0.18, 0.7],
      [UP[start + 1], 0.075, 0.18, 0.75],
      [UP[start + 2], 0.15, 0.18, 0.8],
      [UP[start + 3], 0.225, 0.9, 0.9],
      [UP[start + 4], 0.235, 0.9, 0.45],
    ];
  },

  /* Five in a row: the same idea an octave wider, ending on a held triad rather than a single note. */
  milestone: () => [
    ['C5', 0, 0.14, 0.7],
    ['E5', 0.07, 0.14, 0.75],
    ['G5', 0.14, 0.14, 0.8],
    ['C6', 0.21, 0.16, 0.85],
    ['E6', 0.28, 1.4, 0.9],
    ['C6', 0.29, 1.4, 0.6],
    ['G5', 0.3, 1.4, 0.5],
    ['C5', 0.31, 1.6, 0.45],
  ],

  /* A whole activity finished. */
  finished: () => [
    ['G4', 0.42, 0.12, 0.6],
    ['C5', 0.5, 0.12, 0.7],
    ['E5', 0.58, 0.12, 0.8],
    ['G5', 0.66, 0.12, 0.85],
    ['C6', 0.74, 2, 0.95],
    ['G5', 0.75, 2, 0.7],
    ['E5', 0.76, 2, 0.6],
    ['C5', 0.77, 2.2, 0.55],
  ],
};

/** One right answer.
 * @param {{kind: string, id: string}} [subject]
 */
export function rightAnswer(subject) {
  play(FLOURISHES.rightAnswer(), () => sfx.correct());
  progress.award(1);
  if (subject) mastery.record(subject.kind, subject.id, true);
}

/* One wrong answer. */
export function wrongAnswer(options = {}) {
  // Balloons pops the balloon it was given, and a nudge on top of the pop is two sounds for one tap.
  if (options.sound !== false) sfx.nudge();
  progress.setback();
  // The letter that was *asked for*, never the one that was tapped.
  if (options.subject) mastery.record(options.subject.kind, options.subject.id, false);
}

/* A run of five. */
export function milestone() {
  play(FLOURISHES.milestone(), () => sfx.fanfare());
  // Two on top of the one the answer itself earned.
  progress.award(2);
}

/* A whole activity finished — a board matched, a letter traced. */
export function finished() {
  sfx.drumroll();
  play(FLOURISHES.finished(), () => setTimeout(() => sfx.tada(), 420));
  // Enough to be worth finishing a board for, not so much that finishing three easy boards beats playing properly.
  progress.award(3);
}

/** Renders the flourishes back to back for listening tests.
 * @returns {Promise<{sampleRate:number, channels:Float32Array[]}>}
 */
export async function renderFlourishes() {
  const T = await loadTone();
  const buffer = await T.Offline(async () => {
    const { sampler } = await buildVoice(T, T.getDestination());

    // Three right answers.
    const at = (notes, offset) => {
      for (const [note, t, duration, velocity] of notes) {
        sampler.triggerAttackRelease(note, duration, offset + t, velocity);
      }
    };
    for (let i = 0; i < 3; i++) at(FLOURISHES.rightAnswer(), 0.3 + i * 1.4);
    at(FLOURISHES.milestone(), 5.2);
    at(FLOURISHES.finished(), 8.4);
  }, 12);

  return renderedChannels(buffer);
}

/* Warms the voice up. */
export function prepareFlourishes() {
  prepare();
}

/* Whether the sampled voice came up, or everything is falling back to the synthesised chime. */
export function flourishVoiceReady() {
  return Boolean(voice);
}
