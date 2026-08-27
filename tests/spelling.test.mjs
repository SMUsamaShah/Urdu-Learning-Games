/* What the spelling games are able to ask. */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (f) => JSON.parse(fs.readFileSync(path.join(ROOT, 'content', f), 'utf8'));
const source = (f) => fs.readFileSync(path.join(ROOT, 'src', 'lib', f), 'utf8');

const { letters } = read('letters.json');
const { words } = read('words.json');
const byChar = new Map(letters.map((l) => [l.char, l.id]));

/* Mirrors brokenWord() in content.js: every character must be a letter. */
const broken = (word) => {
  const ids = [...word.word].map((char) => byChar.get(char));
  return ids.every(Boolean) ? ids : null;
};

const spellable = words.filter(broken);

/* The bands from src/lib/spelling.js, read out of it rather than restated. */
const bands = [
  ...source('spelling.js').matchAll(
    /\{ from: (\d+), lengths: \[([\d, ]+)\], hint: (true|false), spare: (\d+) \}/g
  ),
].map(([, from, lengths, hint, spare]) => ({
  from: Number(from),
  lengths: lengths.split(',').map((n) => Number(n.trim())),
  hint: hint === 'true',
  spare: Number(spare),
}));

describe('the words a spelling game can deal', () => {
  test('most of them can be taken apart', () => {
    // چائے cannot — ئ is not one of the thirty-eight letters.
    assert.equal(words.length - spellable.length, 1);
  });

  test('every band has words in it', () => {
    assert.ok(bands.length >= 2, `only ${bands.length} bands parsed — has the shape changed?`);
    for (const band of bands) {
      const pool = spellable.filter((word) => band.lengths.includes(broken(word).length));
      assert.ok(
        pool.length >= 3,
        `the band at level ${band.from} wants words of ${band.lengths.join('/')} letters ` +
          `and there are ${pool.length}`
      );
    }
  });

  test('the bands cover every level, in order, with no gap', () => {
    assert.equal(bands[0].from, 0, 'nothing covers level 0');
    for (let i = 1; i < bands.length; i++) {
      assert.ok(
        bands[i].from > bands[i - 1].from,
        `band ${i} starts at ${bands[i].from}, not after ${bands[i - 1].from}`
      );
    }
  });

  test('it gets harder rather than easier', () => {
    // The hint goes away and stays away; the words never get shorter; the tray never holds fewer wrong letters than it did.
    for (let i = 1; i < bands.length; i++) {
      assert.ok(
        !bands[i].hint || bands[i - 1].hint,
        `the hint comes back at level ${bands[i].from} after being taken away`
      );
      assert.ok(
        Math.max(...bands[i].lengths) >= Math.max(...bands[i - 1].lengths),
        `words get shorter at level ${bands[i].from}`
      );
      assert.ok(
        bands[i].spare >= bands[i - 1].spare,
        `the tray loses a distractor at level ${bands[i].from}`
      );
    }
  });

  test('the easy end is short words with a hint', () => {
    assert.deepEqual(bands[0].lengths, [3]);
    assert.equal(bands[0].hint, true);
    assert.equal(bands[0].spare, 0, 'the very first round should have nothing wrong in the tray');
  });

  test('every word a game can deal has a picture or an emoji', () => {
    // The picture is the question.
    const images = read('images.json').words ?? {};
    for (const word of spellable) {
      assert.ok(
        images[word.id] || word.emoji,
        `${word.id} can be spelled but has no picture and no emoji to ask with`
      );
    }
  });
});
