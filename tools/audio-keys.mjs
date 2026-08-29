/* Node-side helpers for locating audio clips on disk. */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  AUDIO_EXTENSIONS,
  expectedClips as buildClipList,
  slugFor,
} from '../src/lib/clip-list.js';

export { AUDIO_EXTENSIONS, slugFor };

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const CONTENT_DIR = path.join(ROOT, 'content');
export const AUDIO_DIR = path.join(ROOT, 'public', 'audio');
export const RECORDED_DIR = path.join(AUDIO_DIR, 'recorded');
export const TTS_DIR = path.join(AUDIO_DIR, 'tts');

export function readContent(name) {
  return JSON.parse(fs.readFileSync(path.join(CONTENT_DIR, name), 'utf8'));
}

/** Every clip the app wants, in recording order.
 * @returns {import('../src/lib/clip-list.js').Clip[]}
 */
export function expectedClips() {
  return buildClipList({
    letters: readContent('letters.json').letters,
    numbers: readContent('numbers.json').numbers,
    words: readContent('words.json').words,
  });
}

/** Where a clip's audio actually lives, or null.
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
