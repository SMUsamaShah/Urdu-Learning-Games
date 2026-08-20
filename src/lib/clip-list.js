/**
 * The single definition of which audio clips this app needs.
 *
 * Deliberately pure — it takes content in as an argument and touches no
 * filesystem, no bundler features and no browser APIs — because both sides of
 * the project need this exact list:
 *
 *   - Node (`tools/audio-keys.mjs`) reads content/*.json and builds the manifest
 *   - the browser (the in-app recorder) already has the same content imported
 *
 * If these two ever disagreed about what a clip is called, a recording made on a
 * phone would not resolve against a manifest built on a desktop, which is a
 * failure that would only appear after somebody had recorded a hundred clips.
 *
 * Praise is the one group that is not derived from content/: the phrases live
 * in src/lib/praise.js, which is a plain module with no filesystem or bundler
 * dependency, so importing it keeps this file as portable as it was.
 *
 * Keys are paths (`letter/be/name`); slugs are the same with slashes turned into
 * dashes, and are what filenames use. Nothing ever parses a filename back into a
 * key — the expected list is always derived from content and then matched
 * against what exists — so ids containing dashes are not ambiguous.
 */

import { PRAISE } from './praise.js';

export function slugFor(key) {
  return key.replace(/\//g, '-');
}

/**
 * @typedef {object} Clip
 * @property {string} key    e.g. "letter/be/name"
 * @property {string} slug   e.g. "letter-be-name"
 * @property {string} group  heading for the recorder UI
 * @property {string} roman  latin label
 * @property {string} urdu   the Urdu being spoken, as text
 * @property {object} glyph  which baked glyph to draw: {kind, id, form?}
 * @property {string} say    instruction for whoever is recording
 */

/**
 * Every clip the app wants, in the order they should be recorded.
 *
 * @param {{letters: object[], numbers: object[], words: object[]}} content
 * @returns {Clip[]}
 */
export function expectedClips({ letters, numbers, words }) {
  const clips = [];

  // Letter names first: they are the easiest to read aloud and get a recording
  // session moving.
  for (const letter of letters) {
    clips.push({
      key: `letter/${letter.id}/name`,
      slug: slugFor(`letter/${letter.id}/name`),
      group: 'Letter names',
      roman: letter.roman,
      urdu: letter.name,
      glyph: { kind: 'name', id: letter.id },
      say: `The letter's NAME: “${letter.name}” (${letter.roman})`,
    });
  }

  // Then the sounds. Separate clips, and genuinely different: the name of ب is
  // "bay", the sound it makes is "b". Both are taught, and recording them in
  // one batch each keeps the distinction front of mind.
  for (const letter of letters) {
    clips.push({
      key: `letter/${letter.id}/sound`,
      slug: slugFor(`letter/${letter.id}/sound`),
      group: 'Letter sounds',
      roman: letter.sound,
      urdu: letter.char,
      glyph: { kind: 'letter', id: letter.id, form: 'isolated' },
      say: `Only the SOUND: “${letter.sound}” — not the name “${letter.name}”`,
    });
  }

  for (const word of words) {
    clips.push({
      key: `word/${word.id}`,
      slug: slugFor(`word/${word.id}`),
      group: 'Words',
      roman: word.roman,
      urdu: word.word,
      glyph: { kind: 'word', id: word.id },
      say: `The word: “${word.word}” (${word.roman} — ${word.gloss})`,
    });
  }

  // Praise last. It is the only group a parent can record in five minutes and
  // hear immediately in every game, so it is worth being the thing still on
  // screen when they get bored of the alphabet — but it is also the group the
  // app can most afford to be missing, which is why it does not come first.
  for (const praise of PRAISE) {
    clips.push({
      key: `praise/${praise.id}`,
      slug: slugFor(`praise/${praise.id}`),
      group: 'Praise',
      roman: praise.roman,
      urdu: praise.urdu,
      glyph: { kind: 'ui', id: praise.id },
      say: `Encouragement: “${praise.urdu}” (${praise.roman} — ${praise.english}) — say it like you mean it`,
    });
  }

  for (const number of numbers) {
    clips.push({
      key: `number/${number.id}`,
      slug: slugFor(`number/${number.id}`),
      group: 'Numbers',
      roman: number.roman,
      urdu: number.name,
      glyph: { kind: 'number', id: number.id },
      say: `The number: “${number.name}” (${number.roman})`,
    });
  }

  return clips;
}

/** Containers a browser might hand us, best first. */
export const AUDIO_EXTENSIONS = ['webm', 'm4a', 'mp4', 'mp3', 'ogg', 'opus', 'wav'];
