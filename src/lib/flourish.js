/**
 * Getting something right: the sound of it, and the credit for it.
 *
 * Every one of the twenty-four games already called in here at exactly the
 * moment a child got something right, so this is where the score is kept too.
 * The alternative was a line in each game, twenty-four chances to forget it,
 * and a twenty-fifth game that silently awards nothing. See progress.js.
 *
 * ## Why this is not in sfx.js
 *
 * The reward used to be three oscillator beeps — a rising major triad — and it
 * was correct and boring, which for the single most-heard sound in the app is
 * the wrong trade. A child answers a hundred questions in a session; that noise
 * is the payoff for every one of them, and it needs to be worth hearing the
 * hundredth time.
 *
 * The rest of sfx.js is right to stay synthesised. A tap blip, a balloon pop
 * and a page whoosh are gestures, they are over in a tenth of a second, and
 * nobody has ever wished a UI click sounded richer. A reward is a *musical*
 * event and gets judged as one.
 *
 * So the flourishes are played on the same sampled instrument as the background
 * tune, through a reverb, with real chords: a struck glockenspiel arpeggio
 * ringing into a room, rather than three sine waves in a row.
 *
 * ## Three sizes, and keeping them apart
 *
 * A reward that is the same size every time stops being a reward. So:
 *
 *   - `rightAnswer()` — one question. Short, bright, up.
 *   - `milestone()` — a run of five. Longer, with a chord under it.
 *   - `finished()` — a whole activity done. The big one, with a roll into it.
 *
 * They are deliberately the same instrument and the same key as each other and
 * as the music, so they sound like the app rather than like three sound packs.
 *
 * ## Falling back
 *
 * All of this needs Tone and a network fetch of five short samples. Until that
 * resolves — and for ever, if it fails — the caller gets the old synthesised
 * chime instead. Nothing here is allowed to make a right answer silent.
 */

import { masterOut } from './volume.js';

import { loadTone, renderedChannels } from './tone-setup.js';
import * as progress from './progress.js';
import * as sfx from './sfx.js';

/**
 * The voice the rewards are played on.
 *
 * Glockenspiel rather than the tune's music box: it has to cut through the
 * music without the music being ducked for it, and a bright metal strike does
 * that where a soft one does not. It is precached alongside the tune's own
 * instrument — see vite.config.js.
 */
const INSTRUMENT = 'glockenspiel';

/** C major pentatonic, matching the tune, so a flourish is never a clash. */
const UP = ['C5', 'D5', 'E5', 'G5', 'A5', 'C6'];

let ready = null;
let voice = null;

/**
 * Builds the flourish voice, once, in the background.
 *
 * Called on the first right answer rather than at startup: it is a fetch and a
 * reverb render, and doing it during the loading screen delays the menu for a
 * sound nobody needs for another thirty seconds. The first reward of a session
 * therefore falls back to the synthesised chime, which is the correct trade —
 * silence would not be.
 */
function prepare() {
  ready ??= (async () => {
    const T = await loadTone();
    // Into the app's master rather than Tone's own destination, so the volume
    // setting reaches the celebrations too. Tone connects to a native node
    // happily. The offline render below keeps Tone's destination, because it is
    // measuring the instrument rather than playing it.
    voice = { T, ...(await buildVoice(T, masterOut() ?? T.getDestination())) };
    return voice;
  })().catch(() => {
    // Kept null, so every call falls through to the synthesised version rather
    // than retrying a fetch that is not going to start working.
    voice = null;
    return null;
  });
  return ready;
}

/**
 * The sampler and its reverb, built into a destination.
 *
 * Takes its destination so the identical voice serves the live path and the
 * offline render — the same reason createBand does in music.js. A renderer that
 * declares its own instrument is a preview of something else.
 */
async function buildVoice(T, destination) {
  // Short and bright. A long tail on something that fires every few seconds
  // turns into a wash; this is just enough room to stop it sounding dry.
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

/**
 * Plays notes at offsets in seconds from now, if the voice is up.
 *
 * The fallback fires only when *nothing* was scheduled. Wrapping the whole loop
 * and falling back on any failure means a throw on the fourth note plays the
 * synthesised chime on top of three notes already committed to the audio clock
 * — two rewards at once, which is worse than either.
 */
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
      // A late or duplicated trigger; see the note on `safely` in music.js.
    }
  }
  if (!sounded) fallback();
}

/**
 * The three flourishes, as [note, seconds from the start, length, velocity].
 *
 * Written once and used by both the live path and the renderer below. They were
 * two copies for a while, which is a guaranteed drift: the preview would go on
 * sounding like whatever the app used to do.
 */
const FLOURISHES = {
  /**
   * One right answer: four notes up the scale with the last one held, plus a
   * fifth above it. That is the shape of every "yes!" in every game ever made,
   * and it works because it is a question answered — three quick steps and
   * somewhere to land.
   *
   * A function rather than a table, because it starts on a different step each
   * time; a hundred right answers should not be a hundred identical noises.
   */
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

  /**
   * Five in a row: the same idea an octave wider, ending on a held triad rather
   * than a single note. Audibly bigger than one answer without being the end of
   * the world.
   */
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

  /**
   * A whole activity finished. The one with a run-up: the notes start after the
   * drum roll rather than under it.
   */
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

/** One right answer. */
export function rightAnswer() {
  play(FLOURISHES.rightAnswer(), () => sfx.correct());
  progress.award(1);
}

/** A run of five. */
export function milestone() {
  play(FLOURISHES.milestone(), () => sfx.fanfare());
  // Two on top of the one the answer itself earned. A run is worth more than
  // the same number of answers spread out, which is the only place in this app
  // where anything rewards not making a mistake.
  progress.award(2);
}

/**
 * A whole activity finished — a board matched, a letter traced.
 *
 * The roll is still the synthesised one from sfx.js, because a drum roll is
 * noise rather than notes and that is exactly what oscillators and a filter are
 * good at. The fallback is delayed to match: firing it immediately puts the
 * synthesised finish *on top of* the roll instead of after it, which is what
 * the sampled version is careful not to do.
 */
export function finished() {
  sfx.drumroll();
  play(FLOURISHES.finished(), () => setTimeout(() => sfx.tada(), 420));
  // Enough to be worth finishing a board for, not so much that finishing three
  // easy boards beats playing properly.
  progress.award(3);
}

/**
 * Renders the flourishes back to back, for listening to.
 *
 * Same reason music.js can render itself: whether a reward sound is any good is
 * a question only a person can answer, and it should not take playing a game to
 * a milestone to hear one. Offline, so nothing depends on the main thread — see
 * the note on capture in tools/preview-music.mjs.
 *
 * @returns {Promise<{sampleRate:number, channels:Float32Array[]}>}
 */
export async function renderFlourishes() {
  const T = await loadTone();
  const buffer = await T.Offline(async () => {
    const { sampler } = await buildVoice(T, T.getDestination());

    // Three right answers — they differ from each other — then a milestone and
    // a finish, spaced so each is heard as its own event.
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

/**
 * Warms the voice up.
 *
 * Called once the menu is up and the audio context has been unlocked, so that
 * the first right answer of a session gets the good sound rather than the
 * fallback. Safe to call repeatedly.
 */
export function prepareFlourishes() {
  prepare();
}

/**
 * Whether the sampled voice came up, or everything is falling back to the
 * synthesised chime.
 *
 * Exported for the volume check, which measures what reaches the speakers and
 * would otherwise report the fallback as though it were the sampler — two very
 * different signal paths that sound alike enough to be mistaken for each other.
 * A check that cannot tell which one it measured proves less than it claims.
 */
export function flourishVoiceReady() {
  return Boolean(voice);
}
