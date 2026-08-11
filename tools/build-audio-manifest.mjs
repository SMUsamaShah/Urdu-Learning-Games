/**
 * Writes content/audio.json: which clips exist and where.
 *
 * Run after recording anything, or after adding a letter or word.
 * Usage: npm run audio:manifest
 */

import fs from 'node:fs';
import path from 'node:path';
import { CONTENT_DIR, expectedClips, resolveClip } from './audio-keys.mjs';

const OUT_FILE = path.join(CONTENT_DIR, 'audio.json');

const clips = expectedClips();
const found = {};
const missing = [];
const counts = { expected: clips.length, recorded: 0, tts: 0, missing: 0 };

for (const clip of clips) {
  const resolved = resolveClip(clip.slug);
  if (resolved) {
    found[clip.key] = resolved.path;
    counts[resolved.source]++;
  } else {
    missing.push(clip.key);
    counts.missing++;
  }
}

fs.writeFileSync(
  OUT_FILE,
  JSON.stringify({ clips: found, missing, counts }, null, 0)
);

const done = counts.recorded + counts.tts;
const pct = counts.expected ? Math.round((done / counts.expected) * 100) : 0;
console.log(
  `content/audio.json: ${done}/${counts.expected} clips (${pct}%) — ` +
    `${counts.recorded} recorded, ${counts.tts} generated, ${counts.missing} missing`
);

// Missing clips are the normal state while recording is in progress, so this
// reports rather than fails. The app treats a missing clip as silence.
if (counts.missing > 0 && process.argv.includes('--list-missing')) {
  console.log('\nStill needed:');
  for (const key of missing) console.log('  ' + key);
}
