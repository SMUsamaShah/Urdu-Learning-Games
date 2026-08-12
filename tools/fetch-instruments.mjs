/**
 * Downloads the handful of instrument notes the background tune is played on.
 *
 * ## Why samples at all
 *
 * The tune was synthesised from scratch twice — once by hand in Web Audio, once
 * with Tone.js synth voices — and both times it came out correct and unpleasant.
 * Timbre is the whole difference, and a recording of a real instrument being
 * struck contains detail that no envelope over an oscillator reproduces: the
 * knock of the mallet, the way the partials fall out of tune as the note dies,
 * the body of the thing resonating.
 *
 * Sampling one instrument fixes what two rounds of synthesis could not. The
 * lead is the only voice anybody hears; the bass and the pad stay synthesised,
 * because a bass line under a nursery melody on a phone speaker is felt rather
 * than identified, and the pad is deliberately not identifiable at all.
 *
 * ## Why so few notes
 *
 * Five per instrument, a tritone apart, and everything in between is pitched
 * from the nearest. Sampling every semitone would be forty files for a
 * background loop nobody is listening closely to; at this spacing the shift is
 * at most three semitones, which on a mallet instrument is inaudible.
 *
 * Note names follow the source's convention, which spells accidentals as flats
 * — Gb4, not Fs4. Asking for the sharp gets a 404 and, since a missing note is
 * tolerated below, a silently coarser instrument.
 *
 * ## Licence
 *
 * FluidR3_GM, via gleitz/midi-js-soundfonts, both MIT — compatible with this
 * repo. That was the deciding factor over the alternatives: Strudel is
 * AGPL-3.0-or-later and webaudiofont is GPL-3.0-or-later, and either would pull
 * an MIT project into copyleft, which for an app meant to be forked and
 * self-hosted is a real cost rather than a technicality.
 *
 * Usage: node tools/fetch-instruments.mjs [instrument...]
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'public/audio/instruments');
const SOURCE =
  'https://raw.githubusercontent.com/gleitz/midi-js-soundfonts/gh-pages/FluidR3_GM';

/**
 * The notes taken from each instrument.
 *
 * The melody lives between C4 and E5 and the sampler pitches to fill the gaps,
 * so this covers it with three semitones of shift at worst. C6 is there to stop
 * the top of the range being stretched up from C5, which is where pitching
 * starts to sound like a tape running fast.
 */
const NOTES = ['C4', 'Gb4', 'C5', 'Gb5', 'C6'];

/** Everything worth auditioning as the voice of the tune. */
const INSTRUMENTS = ['music_box', 'celesta', 'marimba', 'kalimba', 'glockenspiel'];

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
      // Not fatal: instruments have different ranges, and a glockenspiel that
      // simply does not go down to C4 is a fact about glockenspiels. The
      // sampler fills in from whatever notes it was given. It is reported so
      // that a wholesale failure — a moved repository, no network — still looks
      // like one rather than like a quiet loss of quality.
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
// Every note of every instrument missing means something structural, not a
// range limit.
if (missing >= wanted.length * NOTES.length) {
  console.error('FAIL: nothing downloaded at all');
  process.exit(1);
}
