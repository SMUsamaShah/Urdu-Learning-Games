/**
 * The instrument the tune is played on is named in two places. They must agree.
 *
 * `src/lib/tunes.js` decides which sample folder the sampler fetches from — via
 * DEFAULT_TUNE, whose `instrument` is the one that matters.
 * `vite.config.js` decides which sample folder the service worker precaches.
 * Change one without the other and the app asks for files that were never
 * cached — which works perfectly in development, works on the first online
 * load, and is silent offline. That is the worst shape a bug can have here: it
 * only appears on the aeroplane this app exists to work on.
 *
 * Also checks the samples are actually present, because a gitignore that is
 * slightly too broad would leave a repo that builds, deploys and plays nothing.
 *
 * Run: npm test
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');

const tunes = read('src/lib/tunes.js');
const defaultTune = tunes.match(/export const DEFAULT_TUNE = '([\w-]+)'/);
// The instrument belonging to that tune: find its block, then the first
// `instrument:` inside it.
const block = defaultTune
  ? tunes.slice(tunes.indexOf(`'${defaultTune[1]}': {`))
  : '';
const inMusic = block.match(/instrument: '([\w-]+)'/);
const config = read('vite.config.js');
const inConfig = config.match(/const MUSIC_INSTRUMENT = '([\w-]+)'/);

// The reward flourishes are played on a second instrument, precached the same
// way and with the same failure mode if the two names drift.
const flourish = read('src/lib/flourish.js').match(/const INSTRUMENT = '([\w-]+)'/);
const flourishConfig = config.match(/const FLOURISH_INSTRUMENT = '([\w-]+)'/);

describe('background music instrument', () => {
  test('is named in both places', () => {
    assert.ok(defaultTune, 'could not find DEFAULT_TUNE in src/lib/tunes.js');
    assert.ok(inMusic, `could not find an instrument for tune "${defaultTune?.[1]}"`);
    assert.ok(inConfig, 'could not find MUSIC_INSTRUMENT in vite.config.js');
  });

  test('the two agree', () => {
    assert.equal(
      inMusic[1],
      inConfig[1],
      `tune "${defaultTune[1]}" plays "${inMusic[1]}" but vite.config.js precaches ` +
        `"${inConfig[1]}" — ` +
        'the tune would be silent offline'
    );
  });

  test('the flourish instrument agrees too', () => {
    assert.ok(flourish, 'could not find INSTRUMENT in src/lib/flourish.js');
    assert.ok(flourishConfig, 'could not find FLOURISH_INSTRUMENT in vite.config.js');
    assert.equal(
      flourish[1],
      flourishConfig[1],
      `flourishes play "${flourish[1]}" but vite.config.js precaches ` +
        `"${flourishConfig[1]}" — every right answer would fall back to a beep offline`
    );
  });

  test('its samples are committed', () => {
    const dir = path.join(ROOT, 'public/audio/instruments', inMusic[1]);
    assert.ok(
      fs.existsSync(dir),
      `public/audio/instruments/${inMusic[1]}/ is missing — run node tools/fetch-instruments.mjs`
    );
    const notes = fs.readdirSync(dir).filter((f) => f.endsWith('.mp3'));
    assert.ok(
      notes.length >= 3,
      `only ${notes.length} sample(s) in ${inMusic[1]}/; the sampler needs a few to pitch from`
    );
  });

  test("the flourish instrument's samples are committed", () => {
    const dir = path.join(ROOT, 'public/audio/instruments', flourish[1]);
    assert.ok(
      fs.existsSync(dir),
      `public/audio/instruments/${flourish[1]}/ is missing — run node tools/fetch-instruments.mjs`
    );
  });

  test('the samples are not gitignored', () => {
    // The alternates are deliberately ignored and the chosen one deliberately
    // is not. Getting that backwards produces a repo that builds and deploys
    // with no music at all, which nothing else here would catch.
    const ignore = read('.gitignore');
    assert.match(
      ignore,
      new RegExp(`^!public/audio/instruments/${inMusic[1]}/`, 'm'),
      `.gitignore does not re-include public/audio/instruments/${inMusic[1]}/`
    );
    assert.match(
      ignore,
      new RegExp(`^!public/audio/instruments/${flourish[1]}/`, 'm'),
      `.gitignore does not re-include public/audio/instruments/${flourish[1]}/`
    );
  });
});
