/**
 * Every tune's instrument has to actually ship.
 *
 * All five tunes can be chosen from the grown-ups screen, and each is played on
 * its own sampled instrument. A tune whose samples were never committed, or
 * never precached, is a tune that works in development, works on the first
 * online load, and is silent offline. That is the worst shape a bug can have
 * here, because offline is the case this app exists for.
 *
 * vite.config.js no longer names the instruments — it derives them from
 * src/lib/tunes.js, which is why the "these two lists must agree" tests that
 * used to be here are gone. What is left is what deriving cannot check: that
 * the sample files are on disk, and that .gitignore is not quietly excluding
 * them from the repo. A gitignore slightly too broad leaves something that
 * builds, deploys, and plays nothing.
 *
 * Run: npm test
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DEFAULT_TUNE, TUNES } from '../src/lib/tunes.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');

/** The flourish instrument is written out in flourish.js, which is not data. */
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
    // Read out of the source by pattern, so it is worth checking the pattern
    // still matches rather than silently testing nothing.
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
    // If somebody puts a hand-written instrument name back into the build
    // config, the drift this file used to guard comes back with it — and there
    // would be nothing checking it any more, because these tests were rewritten
    // on the assumption that it cannot happen.
    const config = read('vite.config.js');
    assert.match(
      config,
      /import \{ TUNES \} from '\.\/src\/lib\/tunes\.js'/,
      'vite.config.js no longer imports TUNES — the precache list is being ' +
        'maintained by hand again, and can drift from the tunes'
    );
  });
});
