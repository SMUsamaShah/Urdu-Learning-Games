/**
 * The phrases the app says when a child gets something right.
 *
 * They live in two places on purpose — `src/lib/praise.js` for the recorder,
 * `content/ui.json` for the baked outline the ribbon draws — and a phrase that
 * exists in one and not the other fails silently in a different way each
 * direction. Missing from ui.json: the ribbon comes out blank and the voice
 * still speaks. Missing from praise.js: a baked glyph nothing ever draws.
 *
 * Run: npm test   (requires `npm run bake` to have run first)
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { PRAISE } from '../src/lib/praise.js';
import { expectedClips } from '../src/lib/clip-list.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (f) => JSON.parse(fs.readFileSync(path.join(ROOT, 'content', f), 'utf8'));

const { strings } = read('ui.json');
const glyphs = read('glyphs.json');
const byId = new Map(strings.map((s) => [s.id, s]));

describe('praise', () => {
  test('there are several, each named once', () => {
    // One phrase is the state this replaced. Two would repeat every other time.
    assert.ok(PRAISE.length >= 5, `only ${PRAISE.length} phrases`);
    assert.equal(new Set(PRAISE.map((p) => p.id)).size, PRAISE.length);
    assert.equal(new Set(PRAISE.map((p) => p.urdu)).size, PRAISE.length, 'two phrases are the same words');
  });

  test('every phrase is a ui string, saying exactly the same thing', () => {
    for (const praise of PRAISE) {
      const string = byId.get(praise.id);
      assert.ok(string, `praise "${praise.id}" is not a string in content/ui.json`);
      assert.equal(
        string.text,
        praise.urdu,
        `praise "${praise.id}" says ${praise.urdu} but ui.json says ${string.text}`
      );
    }
  });

  test('every phrase has been baked', () => {
    for (const praise of PRAISE) {
      assert.ok(glyphs.ui?.[praise.id]?.d, `${praise.id} has no outline — run npm run bake`);
    }
  });

  test('every phrase has a roman and an English gloss', () => {
    // The roman is what the recorder prints; the English is what the ribbon
    // shows the parent. An empty one of either is a blank line on a screen.
    for (const praise of PRAISE) {
      assert.ok(praise.roman?.trim(), `${praise.id} has no roman`);
      assert.ok(praise.english?.trim(), `${praise.id} has no English gloss`);
    }
  });

  test('the ribbon knows how to measure them', () => {
    // The ribbon picks one em across every string it can ever show, and
    // wellDone() puts these on it. A phrase missing from that list is drawn at
    // the size chosen for the others — بالکل ٹھیک is the widest string in the
    // app and would simply run off the end. Nothing throws.
    const banner = fs.readFileSync(path.join(ROOT, 'src/lib/banner.js'), 'utf8');
    const block = banner.match(/INSTRUCTIONS = \[([^\]]*)\]/);
    assert.ok(block, 'could not find INSTRUCTIONS in src/lib/banner.js');
    const declared = new Set([...block[1].matchAll(/'([\w-]+)'/g)].map(([, id]) => id));
    for (const praise of PRAISE) {
      assert.ok(declared.has(praise.id), `"${praise.id}" is missing from INSTRUCTIONS in banner.js`);
    }
  });

  test('they turn up in the clip list as their own group', () => {
    const clips = expectedClips({
      letters: read('letters.json').letters,
      numbers: read('numbers.json').numbers,
      words: read('words.json').words,
    });
    const praise = clips.filter((clip) => clip.group === 'Praise');
    assert.equal(praise.length, PRAISE.length);
    for (const clip of praise) {
      assert.equal(clip.key, `praise/${clip.glyph.id}`);
      assert.equal(clip.slug, clip.key.replace('/', '-'));
      assert.equal(clip.glyph.kind, 'ui');
    }
  });
});
