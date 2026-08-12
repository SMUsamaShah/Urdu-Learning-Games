/**
 * The sound of getting something right.
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

import { loadTone } from './tone-setup.js';
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

    const out = new T.Gain(0.9).toDestination();
    // Short and bright. A long tail on something that fires every few seconds
    // turns into a wash; this is just enough room to stop it sounding dry.
    const reverb = new T.Reverb({ decay: 1.6, wet: 0.26 });
    reverb.connect(out);
    await reverb.ready;

    const sampler = new T.Sampler({
      urls: { C4: 'C4.mp3', 'F#4': 'Gb4.mp3', C5: 'C5.mp3', 'F#5': 'Gb5.mp3', C6: 'C6.mp3' },
      baseUrl: `${import.meta.env.BASE_URL}audio/instruments/${INSTRUMENT}/`,
      release: 1.6,
      volume: -6,
    });
    sampler.connect(reverb);
    sampler.connect(out);
    await T.loaded();

    voice = { T, sampler };
    return voice;
  })().catch(() => {
    // Kept null, so every call falls through to the synthesised version rather
    // than retrying a fetch that is not going to start working.
    voice = null;
    return null;
  });
  return ready;
}

/** Plays notes at offsets in seconds from now, if the voice is up. */
function play(notes, fallback) {
  prepare();
  if (!voice) {
    fallback();
    return;
  }
  const { T, sampler } = voice;
  const now = T.now();
  try {
    for (const [note, at, duration, velocity] of notes) {
      sampler.triggerAttackRelease(note, duration, now + at, velocity);
    }
  } catch {
    // A late or duplicated trigger; see the note on `safely` in music.js. The
    // reward simply does not sound, rather than taking the game down.
    fallback();
  }
}

/**
 * One right answer.
 *
 * Four notes up the scale with the last one held, which is the shape of every
 * "yes!" in every game ever made, and it works because it is a question
 * answered: three quick steps and somewhere to land.
 */
export function rightAnswer() {
  // Starts somewhere different each time, so a hundred right answers are not a
  // hundred identical noises. Always upward, always in the same scale.
  const start = Math.floor(Math.random() * 2);
  play(
    [
      [UP[start], 0, 0.18, 0.7],
      [UP[start + 1], 0.075, 0.18, 0.75],
      [UP[start + 2], 0.15, 0.18, 0.8],
      [UP[start + 3], 0.225, 0.9, 0.9],
      // A fifth above the landing note, quietly, which is what makes it sound
      // like a chord arriving rather than a scale stopping.
      [UP[start + 4], 0.235, 0.9, 0.45],
    ],
    () => sfx.correct()
  );
}

/**
 * Five in a row.
 *
 * Same idea an octave wider, and it ends on a held triad rather than a single
 * note — audibly bigger than one answer without being the end of the world.
 */
export function milestone() {
  play(
    [
      ['C5', 0, 0.14, 0.7],
      ['E5', 0.07, 0.14, 0.75],
      ['G5', 0.14, 0.14, 0.8],
      ['C6', 0.21, 0.16, 0.85],
      ['E6', 0.28, 1.4, 0.9],
      ['C6', 0.29, 1.4, 0.6],
      ['G5', 0.3, 1.4, 0.5],
      ['C5', 0.31, 1.6, 0.45],
    ],
    () => sfx.fanfare()
  );
}

/**
 * A whole activity finished — a board matched, a letter traced.
 *
 * The one with a run-up. The roll before it is still the synthesised one from
 * sfx.js, because a drum roll is noise rather than notes and that is exactly
 * what oscillators and filtered noise are good at.
 */
export function finished() {
  sfx.drumroll();
  play(
    [
      ['G4', 0.42, 0.12, 0.6],
      ['C5', 0.5, 0.12, 0.7],
      ['E5', 0.58, 0.12, 0.8],
      ['G5', 0.66, 0.12, 0.85],
      ['C6', 0.74, 2, 0.95],
      ['G5', 0.75, 2, 0.7],
      ['E5', 0.76, 2, 0.6],
      ['C5', 0.77, 2.2, 0.55],
    ],
    () => sfx.tada()
  );
}

/**
 * Renders the three flourishes back to back, for listening to.
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
  const buffer = await T.Offline(async (ctx) => {
    const reverb = new T.Reverb({ decay: 1.6, wet: 0.26 });
    reverb.toDestination();
    await reverb.ready;
    const sampler = new T.Sampler({
      urls: { C4: 'C4.mp3', 'F#4': 'Gb4.mp3', C5: 'C5.mp3', 'F#5': 'Gb5.mp3', C6: 'C6.mp3' },
      baseUrl: `${import.meta.env.BASE_URL}audio/instruments/${INSTRUMENT}/`,
      release: 1.6,
      volume: -6,
    });
    sampler.connect(reverb);
    sampler.toDestination();
    await T.loaded();

    // Three right answers, a milestone, then a finish, spaced so each is heard
    // as its own event rather than as one long noise.
    const at = (notes, offset) => {
      for (const [note, t, duration, velocity] of notes) {
        sampler.triggerAttackRelease(note, duration, offset + t, velocity);
      }
    };
    for (let i = 0; i < 3; i++) {
      at(
        [
          [UP[0], 0, 0.18, 0.7],
          [UP[1], 0.075, 0.18, 0.75],
          [UP[2], 0.15, 0.18, 0.8],
          [UP[3], 0.225, 0.9, 0.9],
          [UP[4], 0.235, 0.9, 0.45],
        ],
        0.3 + i * 1.4
      );
    }
    at(
      [
        ['C5', 0, 0.14, 0.7], ['E5', 0.07, 0.14, 0.75], ['G5', 0.14, 0.14, 0.8],
        ['C6', 0.21, 0.16, 0.85], ['E6', 0.28, 1.4, 0.9], ['C6', 0.29, 1.4, 0.6],
        ['G5', 0.3, 1.4, 0.5], ['C5', 0.31, 1.6, 0.45],
      ],
      5.2
    );
    at(
      [
        ['G4', 0, 0.12, 0.6], ['C5', 0.08, 0.12, 0.7], ['E5', 0.16, 0.12, 0.8],
        ['G5', 0.24, 0.12, 0.85], ['C6', 0.32, 2, 0.95], ['G5', 0.33, 2, 0.7],
        ['E5', 0.34, 2, 0.6], ['C5', 0.35, 2.2, 0.55],
      ],
      8.4
    );
  }, 12);

  return {
    sampleRate: buffer.sampleRate,
    channels: Array.from({ length: buffer.numberOfChannels }, (_, c) =>
      buffer.getChannelData(c)
    ),
  };
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
