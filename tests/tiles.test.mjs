/**
 * The pictures on the menu tiles.
 *
 * Every tile's picture is drawn in code now (src/lib/tile-faces.js), and the
 * letters in those drawings are real baked glyphs looked up by id. That makes
 * one silent failure possible: a face that asks for a letter that does not
 * exist, or for a form that letter never takes. `letterGlyph` returns null, the
 * draw call returns early, and the tile comes out with a hole in it where the
 * letter was — no error, no crash, and nothing a person will notice unless they
 * happen to look at that one tile. `sad` and `he` sat on the menu for weeks for
 * exactly this reason (the ids are `suad` and `choti-he`).
 *
 * Read from the source rather than by importing it, like content.test.mjs: the
 * module pulls in Phaser-adjacent code and JSON imports that node will not take
 * without a bundler, and what is being checked here is which ids appear in the
 * text, which is a question the text can answer.
 *
 * Run: npm test
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = (f) => fs.readFileSync(path.join(ROOT, 'src', 'lib', f), 'utf8');
const content = (f) => JSON.parse(fs.readFileSync(path.join(ROOT, 'content', f), 'utf8'));

/**
 * The module with its prose taken out.
 *
 * Every check below reads quoted strings, and this file's comments are full of
 * apostrophes — "the model's own light" is a quote mark followed by half a
 * sentence as far as a regex is concerned. Stripping the comments first is what
 * makes reading the source a defensible way to ask these questions at all.
 */
const strip = (text) => text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');

const faces = strip(source('tile-faces.js'));
const games = strip(source('games.js'));

const { letters } = content('letters.json');
const { numbers } = content('numbers.json');
const { words } = content('words.json');

const lettersById = new Map(letters.map((l) => [l.id, l]));

/** Which forms a letter actually has, matching FORMS_BY_JOINING in content.test.mjs. */
const FORMS = {
  both: ['isolated', 'initial', 'medial', 'final'],
  right: ['isolated', 'final'],
  none: ['isolated'],
};

/** The keys of the FACES table — one per tile that has a drawing. */
const drawn = [...faces.matchAll(/^ {2}([A-Z]\w+)\(d\) \{$/gm)].map((m) => m[1]);

/** Every tile the menu can show: the games, plus the door to the rest. */
const tiles = [
  ...[...games.matchAll(/^\s*scene: '(\w+)',$/gm)].map((m) => m[1]),
  ...[...games.matchAll(/^\s*art: '(\w+)',$/gm)].map((m) => m[1]),
];

describe('the menu tiles', () => {
  test('every tile has a drawing', () => {
    const missing = tiles.filter((name) => !drawn.includes(name));
    assert.deepEqual(missing, [], `no face in tile-faces.js for ${missing.join(', ')}`);
  });

  test('no drawing is left over from a game that no longer exists', () => {
    const orphans = drawn.filter((name) => !tiles.includes(name));
    assert.deepEqual(orphans, [], `${orphans.join(', ')} are drawn but nothing shows them`);
  });

  test('there are as many drawings as tiles', () => {
    // Belt and braces on the two above, and it is the number that tells a
    // person adding a game that this file is a place they have to visit.
    assert.equal(drawn.length, tiles.length);
    assert.equal(new Set(drawn).size, drawn.length, 'a face is defined twice');
  });
});

describe('what the drawings ask for', () => {
  /**
   * Every bare word the module quotes.
   *
   * Read this way round on purpose. Matching the call sites — `letter('be',
   * 'isolated')` — only catches the ids written out in full, and half of them
   * are not: a caterpillar picks its segment letters out of an array, and the
   * card helper is handed an id from its caller. Sweeping every quoted token
   * and insisting each one is *something* the app knows means a typo cannot
   * hide inside a list.
   */
  const quoted = [...new Set([...faces.matchAll(/'([^']*)'/g)].map((m) => m[1]))];

  /** Strings in the file that are deliberately not content ids. */
  const NOT_IDS = new Set(['isolated', 'initial', 'medial', 'final', 'round', '0']);
  const isColour = (s) => s.startsWith('#');
  const isImport = (s) => s.startsWith('./');

  test('every id a drawing quotes is a letter, a number or a word', () => {
    const numberIds = new Set(numbers.map((n) => n.id));
    const wordIds = new Set(words.map((w) => w.id));
    const strays = quoted.filter(
      (s) =>
        !isColour(s) &&
        !isImport(s) &&
        !NOT_IDS.has(s) &&
        !lettersById.has(s) &&
        !numberIds.has(s) &&
        !wordIds.has(s)
    );
    assert.deepEqual(
      strays,
      [],
      `tile-faces.js quotes ${strays.join(', ')}, which no content file knows about`
    );
  });

  test('a letter is only ever drawn in a form it has', () => {
    const asked = [...faces.matchAll(/'([\w-]+)', '(isolated|initial|medial|final)'/g)];
    assert.ok(asked.length > 10, `only ${asked.length} letter-and-form pairs found`);
    for (const [, id, form] of asked) {
      const letter = lettersById.get(id);
      assert.ok(letter, `a tile draws the letter "${id}", which is not in letters.json`);
      assert.ok(
        FORMS[letter.joins].includes(form),
        `a tile draws ${id} in its ${form} form, and a "${letter.joins}"-joining letter has no such form`
      );
    }
  });

  test('at least one drawing uses a numeral and one uses a word', () => {
    // The counting tiles and the word tile are the reason numberGlyph and
    // wordGlyph are wired into the kit at all; if they stop being used the
    // wiring is dead code rather than a feature.
    assert.ok(quoted.some((s) => numbers.some((n) => n.id === s)), 'no numerals on any tile');
    assert.ok(quoted.some((s) => words.some((w) => w.id === s)), 'no words on any tile');
  });
});
