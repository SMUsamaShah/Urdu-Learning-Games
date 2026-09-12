import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { WORD_COLORS, wordColor } from '../src/lib/word-colors.js';

const WORD_GLYPHS = Object.values(
  JSON.parse(readFileSync(new URL('../content/glyphs.json', import.meta.url), 'utf8')).words
);

const SUPPLIED_PALETTE = [
  '#FF0000',
  '#FFFF00',
  '#00EAFF',
  '#AA00FF',
  '#FF7F00',
  '#0095FF',
  '#FF00AA',
  '#FFD400',
  '#0040FF',
  '#EDB9B9',
];

test('the word palette matches the supplied colours and order', () => {
  assert.deepEqual(WORD_COLORS, SUPPLIED_PALETTE);
  assert.equal(new Set(WORD_COLORS).size, WORD_COLORS.length);
  for (const color of WORD_COLORS) assert.match(color, /^#[0-9A-F]{6}$/);
});

test('every taught word gets a different colour for each source letter', () => {
  for (const glyph of WORD_GLYPHS) {
    const colours = glyph.clusters.map((_, index) => wordColor(index));
    assert.equal(
      new Set(colours).size,
      colours.length,
      `a ${glyph.clusters.length}-letter word repeats a colour`
    );
  }
});

test('the palette repeats predictably after all supplied colours', () => {
  assert.equal(wordColor(0), wordColor(WORD_COLORS.length));
  assert.equal(wordColor(WORD_COLORS.length + 1), wordColor(1));
});
