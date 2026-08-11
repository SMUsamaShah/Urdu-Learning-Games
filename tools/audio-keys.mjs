/**
 * The single definition of which audio clips this app needs.
 *
 * Shared by the manifest builder, the recording studio and the tests, so those
 * three can never disagree about what exists. Adding a letter or a word to
 * content/ changes this list automatically.
 *
 * Keys are paths (`letter/be/name`); filenames are the same with slashes turned
 * into dashes. Nothing ever parses a filename back into a key — the expected
 * list is always derived from content and then matched against files on disk —
 * so letter ids that already contain dashes are not ambiguous.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const CONTENT_DIR = path.join(ROOT, 'content');
export const AUDIO_DIR = path.join(ROOT, 'public', 'audio');
export const RECORDED_DIR = path.join(AUDIO_DIR, 'recorded');
export const TTS_DIR = path.join(AUDIO_DIR, 'tts');

/**
 * Containers a browser might hand us. MediaRecorder gives webm/opus in Chrome
 * and mp4/aac in Safari, and `decodeAudioData` reads both, so recordings are
 * stored in whatever the browser produced rather than transcoded — that would
 * mean every contributor needing ffmpeg installed.
 */
export const AUDIO_EXTENSIONS = ['webm', 'm4a', 'mp4', 'mp3', 'ogg', 'opus', 'wav'];

export function readContent(name) {
  return JSON.parse(fs.readFileSync(path.join(CONTENT_DIR, name), 'utf8'));
}

export function slugFor(key) {
  return key.replace(/\//g, '-');
}

/**
 * @typedef {object} Clip
 * @property {string} key    e.g. "letter/be/name"
 * @property {string} slug   e.g. "letter-be-name"
 * @property {string} group  heading for the studio
 * @property {string} roman  latin label
 * @property {string} urdu   the Urdu being spoken, as text
 * @property {object} glyph  which baked glyph to draw: {kind, id, form?}
 * @property {string} say    instruction for whoever is recording
 */

/**
 * Every clip the app wants, in the order they should be recorded.
 * @returns {Clip[]}
 */
export function expectedClips() {
  const { letters } = readContent('letters.json');
  const { numbers } = readContent('numbers.json');
  const { words } = readContent('words.json');
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

/**
 * Where a clip's audio actually lives, or null.
 *
 * A hand recording always beats a generated one. That ordering is the entire
 * override mechanism: drop a file into public/audio/recorded/ and it wins, with
 * no code or config change.
 *
 * @returns {{path: string, source: 'recorded'|'tts'}|null}
 */
export function resolveClip(slug) {
  for (const [source, dir] of [
    ['recorded', RECORDED_DIR],
    ['tts', TTS_DIR],
  ]) {
    for (const ext of AUDIO_EXTENSIONS) {
      const file = path.join(dir, `${slug}.${ext}`);
      if (fs.existsSync(file)) {
        // Relative to the site root so it resolves under a Pages subpath.
        return { path: `audio/${source}/${slug}.${ext}`, source };
      }
    }
  }
  return null;
}
