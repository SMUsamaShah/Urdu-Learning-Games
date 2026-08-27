/* Downloads the handful of instrument notes the background tune is played on. */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'public/audio/instruments');
const SOURCE =
  'https://raw.githubusercontent.com/gleitz/midi-js-soundfonts/gh-pages/FluidR3_GM';

/* The notes taken from each instrument. */
const NOTES = ['C4', 'Gb4', 'C5', 'Gb5', 'C6'];

/* Everything worth auditioning as a voice. */
const INSTRUMENTS = [
  'music_box',
  'celesta',
  'marimba',
  'kalimba',
  'glockenspiel',
  'sitar',
  'koto',
  'acoustic_guitar_nylon',
  'pizzicato_strings',
];

const wanted = process.argv.slice(2).length ? process.argv.slice(2) : INSTRUMENTS;

fs.mkdirSync(OUT, { recursive: true });

let total = 0;
let missing = 0;
for (const instrument of wanted) {
  const dir = path.join(OUT, instrument);
  fs.mkdirSync(dir, { recursive: true });

  for (const note of NOTES) {
    const target = path.join(dir, `${note}.mp3`);
    if (fs.existsSync(target)) {
      total += fs.statSync(target).size;
      continue;
    }

    const url = `${SOURCE}/${instrument}-mp3/${note}.mp3`;
    const response = await fetch(url);
    if (!response.ok) {
      // Not fatal: instruments have different playable ranges.
      console.error(`  missing: ${instrument} ${note} (HTTP ${response.status})`);
      missing++;
      continue;
    }
    const bytes = Buffer.from(await response.arrayBuffer());
    fs.writeFileSync(target, bytes);
    total += bytes.length;
    process.stderr.write(`· ${instrument}/${note}.mp3 ${(bytes.length / 1024).toFixed(0)} KB\n`);
  }
}

fs.writeFileSync(
  path.join(OUT, 'README.txt'),
  [
    'Instrument samples for the background tune.',
    '',
    'Source: https://github.com/gleitz/midi-js-soundfonts (MIT), generated from',
    'the FluidR3_GM soundfont (MIT). Redistributed here under those terms.',
    '',
    'Regenerate with: node tools/fetch-instruments.mjs',
    '',
    'Only the instrument named in src/lib/music.js is loaded at runtime. The',
    'others are kept so the tune can be auditioned on a different voice without',
    'a network round trip — see npm run music:preview.',
    '',
  ].join('\n')
);

const got = [];
for (const instrument of wanted) {
  const dir = path.join(OUT, instrument);
  got.push(`${instrument} ${fs.readdirSync(dir).length}/${NOTES.length}`);
}
console.log(`${got.join(', ')} — ${(total / 1024).toFixed(0)} KB total`);
// Every note of every instrument missing means something structural, not a range limit.
if (missing >= wanted.length * NOTES.length) {
  console.error('FAIL: nothing downloaded at all');
  process.exit(1);
}
