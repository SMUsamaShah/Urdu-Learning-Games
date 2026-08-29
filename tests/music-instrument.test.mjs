/* Every tune's instrument has to actually ship. */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DEFAULT_TUNE, TUNES } from '../src/lib/tunes.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');

/* The flourish instrument is written out in flourish.js, which is not data. */
const flourish = read('src/lib/flourish.js').match(/const INSTRUMENT = '([\w-]+)'/);

const needed = [
  ...new Set([...Object.values(TUNES).map((t) => t.instrument), flourish?.[1]]),
].filter(Boolean);

describe('instrument samples', () => {
  test('there are tunes, and the default is one of them', () => {
    assert.ok(Object.keys(TUNES).length > 0, 'TUNES is empty');
    assert.ok(
      TUNES[DEFAULT_TUNE],
      `DEFAULT_TUNE is "${DEFAULT_TUNE}", which is not a tune in TUNES`
    );
  });

  test('the flourish instrument is still findable', () => {
    // Read out of the source by pattern.
    assert.ok(flourish, 'could not find INSTRUMENT in src/lib/flourish.js');
  });

  for (const instrument of needed) {
    test(`${instrument}: samples are on disk`, () => {
      const dir = path.join(ROOT, 'public/audio/instruments', instrument);
      assert.ok(
        fs.existsSync(dir),
        `public/audio/instruments/${instrument}/ is missing — ` +
          'run node tools/fetch-instruments.mjs'
      );
      const notes = fs.readdirSync(dir).filter((f) => f.endsWith('.mp3'));
      assert.ok(
        notes.length >= 3,
        `only ${notes.length} sample(s) in ${instrument}/; ` +
          'the sampler needs a few to pitch from'
      );
    });

    test(`${instrument}: samples are not gitignored`, () => {
      assert.match(
        read('.gitignore'),
        new RegExp(`^!public/audio/instruments/${instrument}/`, 'm'),
        `.gitignore does not re-include public/audio/instruments/${instrument}/`
      );
    });
  }

  test('vite.config.js derives the list rather than repeating it', () => {
    // If somebody puts a hand-written instrument name back into the build config.
    const config = read('vite.config.js');
    assert.match(
      config,
      /import \{ TUNES \} from '\.\/src\/lib\/tunes\.js'/,
      'vite.config.js no longer imports TUNES — the precache list is being ' +
        'maintained by hand again, and can drift from the tunes'
    );
  });
});
