/* Integrity checks over content/. */

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
    // ا د ڈ ذ ر ڑ ز ژ و ے connect only to the letter before them, and ء connects to nothing.
    const expected = [
      'alif', 'dal', 'Dal', 'zal', 're', 'Re', 'ze', 'zhe', 'wao', 'bari-ye',
    ].sort();
    const actual = letters.filter((l) => l.joins === 'right').map((l) => l.id).sort();
    assert.deepEqual(actual, expected);

    const never = letters.filter((l) => l.joins === 'none').map((l) => l.id);
    assert.deepEqual(never, ['hamza']);
  });

  test('a letter name is never just the letter itself', () => {
    // The name (bay) and the character (ب) are different things, and the name is what gets spoken.
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
    // The check that matters most.
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

describe('words taken apart', () => {
  /* The Letters screen spells each word out — ب ک ر ی under بکری — by looking every character up in letters.json. */
  const lettersByChar = new Map(letters.map((l) => [l.char, l]));

  test('the taught letter really is at the index the word claims', () => {
    // letterIndex says where in the word the letter being taught sits, and the spelled-out row tints that cell.
    for (const word of words) {
      const letter = letters.find((l) => l.id === word.letter);
      const at = [...word.word][word.letterIndex];
      assert.equal(
        at,
        letter.char,
        `${word.id}: index ${word.letterIndex} of ${word.word} is ${at}, not ${letter.char}`
      );
    }
  });

  test('exactly one word cannot be taken apart, and it is چائے', () => {
    // چائے is written with ئ.
    const unbreakable = words
      .filter((word) => [...word.word].some((char) => !lettersByChar.has(char)))
      .map((word) => word.id);
    assert.deepEqual(unbreakable, ['chaaye']);
  });
});

describe('word clusters', () => {
  /* Noto keeps every source letter in its own cluster for per-letter colouring. */
  const SEPARABLE = words.length;

  test('word outlines record the separate colouring font', () => {
    assert.match(glyphs.wordFont?.file ?? '', /noto-nastaliq-urdu/i);
  });

  test('every word has clusters covering it exactly once', () => {
    for (const word of words) {
      const baked = glyphs.words[word.id];
      assert.ok(baked?.clusters?.length, `${word.id} has no clusters — re-run npm run bake`);
      const spans = [...baked.clusters].sort((a, b) => a.from - b.from);
      assert.equal(spans[0].from, 0, `${word.id} does not start at character 0`);
      assert.equal(
        spans[spans.length - 1].to,
        [...word.word].length,
        `${word.id}'s clusters stop short of the end of the word`
      );
      for (let i = 1; i < spans.length; i++) {
        assert.equal(
          spans[i].from,
          spans[i - 1].to,
          `${word.id} has a gap or an overlap at character ${spans[i].from}`
        );
      }
    }
  });

  test('every cluster carries an outline', () => {
    for (const word of words) {
      for (const cluster of glyphs.words[word.id].clusters) {
        assert.ok(
          cluster.d?.length,
          `${word.id}'s cluster ${cluster.from}-${cluster.to} has no path`
        );
      }
    }
  });

  test(`the taught letter is separable in exactly ${SEPARABLE} words`, () => {
    const separable = words.filter((word) =>
      glyphs.words[word.id].clusters.some(
        (c) => c.from === word.letterIndex && c.to === word.letterIndex + 1
      )
    );
    assert.equal(
      separable.length,
      SEPARABLE,
      `separable in ${separable.length}: ${separable.map((w) => w.id).join(', ')}`
    );
  });
});

describe('numbers', () => {
  /* 0–100, then a thousand and a lakh. */
  const EXPECTED = [...Array.from({ length: 101 }, (unused, i) => i), 1000, 100000];

  test('every value is there exactly once, in order', () => {
    assert.deepEqual(numbers.map((n) => n.value), EXPECTED);
  });

  test('ids follow the values', () => {
    for (const n of numbers) assert.equal(n.id, `n${n.value}`);
  });

  test('digits use the Urdu block, not the Arabic one', () => {
    // ۴ ۶ ۷ (U+06F4/6/7) are drawn differently from ٤ ٦ ٧ (U+0664/6/7).
    for (const n of numbers) {
      const digits = [...n.char];
      assert.equal(
        digits.join(''),
        String(n.value)
          .split('')
          .map((d) => String.fromCodePoint(0x06f0 + Number(d)))
          .join(''),
        `${n.id} is written ${n.char}`
      );
    }
  });

  test('every name and every romanisation is its own', () => {
    // The check that catches a copy-paste in ninety hand-written words.
    const names = numbers.map((n) => n.name);
    const romans = numbers.map((n) => n.roman);
    const twice = (list) => list.filter((v, i) => list.indexOf(v) !== i);
    assert.deepEqual(twice(names), [], 'a name is used for two numbers');
    assert.deepEqual(twice(romans), [], 'a romanisation is used for two numbers');
  });

  test('nothing is blank', () => {
    for (const n of numbers) {
      assert.ok(n.name?.trim(), `${n.id} has no Urdu name`);
      assert.ok(n.roman?.trim(), `${n.id} has no romanisation`);
    }
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
    // An empty path means the font had no outline for it, which renders as a blank box in game rather than throwing.
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
    // If the shaper silently failed, every form would come back as the isolated glyph and the forms row would teach nothing.
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
    // The failure this guards against is losing the source-letter map while baking a whole word.
    const byChar = new Map(letters.map((l) => [l.char, l.id]));
    const byId = new Map(letters.map((l) => [l.id, l]));
    let checked = 0;
    for (const word of words) {
      const ids = [...word.word].map((c) => byChar.get(c)).filter(Boolean);
      const joins = ids.slice(0, -1).filter((id) => byId.get(id).joins === 'both').length;
      if (!joins) continue;

      const clusters = [...glyphs.words[word.id].clusters].sort((a, b) => a.from - b.from);
      assert.ok(
        clusters.length === [...word.word].length &&
          clusters.every((cluster, index) => cluster.from === index && cluster.to === index + 1),
        `${word.id} (${word.word}) lost a source-letter cluster while shaping its joined form`
      );
      checked++;
    }
    assert.ok(checked > 20, `only ${checked} words had a join to check`);
  });
});
