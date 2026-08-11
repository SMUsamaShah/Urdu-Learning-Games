/**
 * Every Urdu UI string a scene asks for must exist and must have been baked.
 *
 * This is the same class of bug as a missing Workbox glob: nothing throws, no
 * console error appears, and the app runs — a ribbon with a typo'd id simply
 * comes out blank, and the only way to notice is for somebody to look at that
 * particular screen. A build that has not been re-baked after adding a string
 * fails the same way.
 *
 * The ids are found by reading the source rather than by running the app,
 * because the point is to catch the id that is only reached on a screen nobody
 * opened this week.
 *
 * Run: npm test   (requires `npm run bake` to have run first)
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (f) => JSON.parse(fs.readFileSync(path.join(ROOT, 'content', f), 'utf8'));

const { strings } = read('ui.json');
const glyphs = read('glyphs.json');

/** Every way a scene names a UI string. */
const PATTERNS = [
  /\buiGlyph\(\s*'([\w-]+)'/g,
  /\bui:\s*'([\w-]+)'/g,
  /\bthis\.instruction\s*=\s*'([\w-]+)'/g,
  /\bsetInstruction\(\s*'([\w-]+)'/g,
];

function sourceFiles(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(full);
    return entry.name.endsWith('.js') ? [full] : [];
  });
}

/** @type {Map<string, string[]>} id -> files that reference it */
const referenced = new Map();
for (const file of sourceFiles(path.join(ROOT, 'src'))) {
  const source = fs.readFileSync(file, 'utf8');
  for (const pattern of PATTERNS) {
    for (const [, id] of source.matchAll(pattern)) {
      const where = path.relative(ROOT, file);
      referenced.set(id, [...(referenced.get(id) ?? []), where]);
    }
  }
}

describe('ui strings', () => {
  test('the scenes reference some, so the patterns above still match', () => {
    // Without this, a refactor that changes how ids are written turns every
    // assertion below into a check over an empty set that can never fail.
    assert.ok(
      referenced.size >= 8,
      `only found ${referenced.size} UI string references in src/ — ` +
        'the patterns in this test have probably gone stale'
    );
  });

  test('every referenced string exists in content/ui.json', () => {
    const known = new Set(strings.map((s) => s.id));
    for (const [id, files] of referenced) {
      assert.ok(known.has(id), `"${id}" (used by ${files.join(', ')}) is not in ui.json`);
    }
  });

  test('every string in ui.json has been baked', () => {
    for (const { id } of strings) {
      assert.ok(glyphs.ui?.[id], `"${id}" is in ui.json but not in glyphs.json — run npm run bake`);
      assert.ok(glyphs.ui[id].d, `"${id}" baked to an empty outline`);
    }
  });
});
