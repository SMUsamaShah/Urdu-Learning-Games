/**
 * Integrity checks over content/.
 *
 * These exist because the mistakes this project is most likely to make are
 * quiet ones: a letter given the wrong joining behaviour still produces valid
 * JSON and a plausible-looking screen, it just teaches a form of the letter
 * that does not exist. Every assertion here corresponds to something that
 * would otherwise only be caught by an Urdu-reading human noticing.
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

const { letters } = read('letters.json');
const { numbers } = read('numbers.json');
const { words } = read('words.json');
const { orderings } = read('orderings.json');
const { strings } = read('ui.json');
const glyphs = read('glyphs.json');

const FORMS_BY_JOINING = {
  both: ['isolated', 'initial', 'medial', 'final'],
  right: ['isolated', 'final'],
  none: ['isolated'],
};

describe('letters', () => {
  test('the qaida inventory is complete and unique', () => {
    assert.equal(letters.length, 38);
    assert.equal(new Set(letters.map((l) => l.id)).size, 38);
    assert.equal(new Set(letters.map((l) => l.char)).size, 38);
  });

  test('every letter declares a valid joining behaviour', () => {
    for (const letter of letters) {
      assert.ok(
        letter.joins in FORMS_BY_JOINING,
        `${letter.id} has joins: ${JSON.stringify(letter.joins)}`
      );
    }
  });

  test('the non-joiners are exactly the ones Urdu says they are', () => {
    // ا د ڈ ذ ر ڑ ز ژ و ے connect only to the letter before them, and ء
    // connects to nothing. Anything else here means a letter would be taught
    // with initial and medial forms it does not have.
    const expected = [
      'alif', 'dal', 'Dal', 'zal', 're', 'Re', 'ze', 'zhe', 'wao', 'bari-ye',
    ].sort();
    const actual = letters.filter((l) => l.joins === 'right').map((l) => l.id).sort();
    assert.deepEqual(actual, expected);

    const never = letters.filter((l) => l.joins === 'none').map((l) => l.id);
    assert.deepEqual(never, ['hamza']);
  });

  test('a letter name is never just the letter itself', () => {
    // The name (bay) and the character (ب) are different things, and the name
    // is what gets spoken. A name equal to the char means the field was filled
    // in by copying rather than by knowing.
    for (const letter of letters) {
      assert.notEqual(letter.name, letter.char, `${letter.id} name equals char`);
      assert.ok(letter.sound, `${letter.id} has no sound`);
    }
  });

  test('every word reference resolves', () => {
    const wordIds = new Set(words.map((w) => w.id));
    for (const letter of letters) {
      if (letter.word === null) continue;
      assert.ok(wordIds.has(letter.word), `${letter.id} -> missing word ${letter.word}`);
    }
  });
});

describe('words', () => {
  test('every word points back at a real letter', () => {
    const letterIds = new Set(letters.map((l) => l.id));
    for (const word of words) {
      assert.ok(letterIds.has(word.letter), `${word.id} -> missing letter ${word.letter}`);
    }
  });

  test('letterIndex actually points at its letter inside the word', () => {
    // The check that matters most. R, do-chashmi-he and choti-ye never begin a
    // word, so their letterIndex is non-zero, and an app that assumed index 0
    // would silently highlight the wrong character.
    const byId = new Map(letters.map((l) => [l.id, l]));
    for (const word of words) {
      const letter = byId.get(word.letter);
      const chars = [...word.word];
      assert.ok(
        word.letterIndex >= 0 && word.letterIndex < chars.length,
        `${word.id}: letterIndex ${word.letterIndex} out of range`
      );
      assert.equal(
        chars[word.letterIndex],
        letter.char,
        `${word.id}: index ${word.letterIndex} is "${chars[word.letterIndex]}", ` +
          `expected "${letter.char}" (${letter.id})`
      );
    }
  });

  test('the letters that cannot start a word are not taught as if they could', () => {
    const byId = new Map(words.map((w) => [w.letter, w]));
    for (const id of ['Re', 'do-chashmi-he', 'choti-ye']) {
      const word = byId.get(id);
      if (!word) continue;
      assert.notEqual(word.letterIndex, 0, `${id} cannot begin an Urdu word`);
    }
  });

  test('each word has a picture and a gloss', () => {
    for (const word of words) {
      assert.ok(word.emoji || word.image, `${word.id} has no picture`);
      assert.ok(word.gloss, `${word.id} has no gloss`);
    }
  });
});

describe('numbers', () => {
  test('digits use the Urdu block, not the Arabic one', () => {
    // ۴ ۶ ۷ (U+06F4/6/7) are drawn differently from ٤ ٦ ٧ (U+0664/6/7).
    // Picking the wrong block gives digits an Urdu reader will not recognise.
    assert.equal(numbers.length, 10);
    numbers.forEach((n, i) => {
      assert.equal(n.value, i);
      assert.equal(
        n.char.codePointAt(0),
        0x06f0 + i,
        `${n.id} is U+${n.char.codePointAt(0).toString(16)}, expected U+06F${i}`
      );
    });
  });
});

describe('orderings', () => {
  test('alphabetical covers every letter exactly once', () => {
    const sequence = orderings.alphabetical.sequence;
    assert.deepEqual([...sequence].sort(), letters.map((l) => l.id).sort());
  });

  test('shape-families covers every letter exactly once', () => {
    const flat = orderings['shape-families'].groups.flatMap((g) => g.letters);
    assert.deepEqual([...flat].sort(), letters.map((l) => l.id).sort());
  });

  test('shape-family groups agree with each letter shapeFamily', () => {
    for (const group of orderings['shape-families'].groups) {
      for (const id of group.letters) {
        const letter = letters.find((l) => l.id === id);
        assert.equal(
          letter.shapeFamily,
          group.family,
          `${id} is in group ${group.family} but declares ${letter.shapeFamily}`
        );
      }
    }
  });
});

describe('baked glyphs', () => {
  test('every letter has exactly the forms its joining behaviour allows', () => {
    for (const letter of letters) {
      const expected = FORMS_BY_JOINING[letter.joins];
      const actual = Object.keys(glyphs.letters[letter.id] ?? {});
      assert.deepEqual(
        actual.sort(),
        [...expected].sort(),
        `${letter.id} (joins: ${letter.joins})`
      );
    }
  });

  test('no glyph is empty', () => {
    // An empty path means the font had no outline for it, which renders as a
    // blank box in game rather than throwing.
    const check = (glyph, label) => {
      assert.ok(glyph, `${label} is missing`);
      assert.ok(glyph.d.length > 0, `${label} has an empty outline`);
      assert.ok(glyph.bbox[2] > 0 && glyph.bbox[3] > 0, `${label} has an empty bbox`);
    };
    for (const letter of letters) {
      for (const [form, glyph] of Object.entries(glyphs.letters[letter.id])) {
        check(glyph, `${letter.id}.${form}`);
      }
    }
    for (const n of numbers) check(glyphs.numbers[n.id], n.id);
    for (const w of words) check(glyphs.words[w.id], w.id);
    for (const s of strings) check(glyphs.ui[s.id], `ui:${s.id}`);
  });

  test('positional forms of a joining letter are actually different shapes', () => {
    // If the shaper silently failed, every form would come back as the isolated
    // glyph and the forms row would teach nothing.
    for (const letter of letters.filter((l) => l.joins === 'both')) {
      const forms = glyphs.letters[letter.id];
      const paths = new Set(Object.values(forms).map((g) => g.d));
      assert.ok(
        paths.size >= 3,
        `${letter.id} has ${paths.size} distinct shapes across 4 forms`
      );
    }
  });

  test('words are shaped, not letters set side by side', () => {
    // The failure this guards against is a word baked as its letters in a row:
    // isolated forms, no joins, no ligatures, no slope. That is what an Urdu
    // word looks like when the shaper has been bypassed, and it is wrong in a
    // way a child would learn from.
    //
    // Measured on the advance rather than the height. Height was the obvious
    // test and it is a fact about one typeface, not about Nastaliq: it read
    // "taller than 0.6 em", which Noto's proportions passed and AlQalam Taj's
    // fail while stacking perfectly well — درخت is 0.59 em tall in it.
    //
    // Advance is the honest measure because joining always draws a word in
    // narrower than its letters standing apart, whichever way the font gets
    // its slope. Noto stacks single glyphs with GPOS offsets and AlQalam Taj
    // substitutes one ligature for the whole word; both come out far under
    // this bound, and letters in a row could not.
    // Only where a join is actually required. Half the alphabet joins to the
    // right only, so وردی — و ر د ی, none of which connects forwards — really
    // is four separate shapes in a row, and asserting otherwise would be
    // asserting something false about Urdu.
    const byChar = new Map(letters.map((l) => [l.char, l.id]));
    const byId = new Map(letters.map((l) => [l.id, l]));
    let checked = 0;
    for (const word of words) {
      const ids = [...word.word].map((c) => byChar.get(c)).filter(Boolean);
      const joins = ids.slice(0, -1).filter((id) => byId.get(id).joins === 'both').length;
      if (!joins) continue;

      // Per join rather than as a fraction of the word: ظروف is four letters
      // with only one join in it (ظ→ر; ر and و do not connect forwards), so it
      // legitimately compresses by 8% where مچھلی compresses by 60%. Every
      // join in the set buys at least a sixth of an em; a tenth is the bound,
      // and letters simply concatenated would buy nothing at all.
      const apart = ids.reduce((total, id) => total + glyphs.letters[id].isolated.advance, 0);
      const joined = glyphs.words[word.id].advance;
      assert.ok(
        apart - joined > joins * glyphs.upem * 0.1,
        `${word.id} (${word.word}) has ${joins} join(s) but shapes to ${joined} units ` +
          `against ${apart} for its letters set apart — it does not look joined`
      );
      checked++;
    }
    assert.ok(checked > 20, `only ${checked} words had a join to check`);
  });
});
