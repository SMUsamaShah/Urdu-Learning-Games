/* The single definition of which audio clips this app needs. */

import { PRAISE } from './praise.js';

export function slugFor(key) {
  return key.replace(/\//g, '-');
}

/**
 * @typedef {object} Clip
 * @property {string} key e.g. "letter/be/name"
 * @property {string} slug e.g. "letter-be-name"
 * @property {string} group heading for the recorder UI
 * @property {string} roman latin label
 * @property {string} urdu the Urdu being spoken, as text
 * @property {object} glyph which baked glyph to draw: {kind, id, form?}
 * @property {string} say instruction for whoever is recording
 */

/** Every clip the app wants, in the order they should be recorded.
 * @param {{letters: object[], numbers: object[], words: object[]}} content
 * @returns {Clip[]}
 */
export function expectedClips({ letters, numbers, words }) {
  const clips = [];

  // Letter names first: they are the easiest to read aloud and get a recording session moving.
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

  // Then the sounds.
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

  // Praise last.
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

/* Containers a browser might hand us, best first. */
export const AUDIO_EXTENSIONS = ['webm', 'm4a', 'mp4', 'mp3', 'ogg', 'opus', 'wav'];
