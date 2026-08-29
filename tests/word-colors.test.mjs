import { test } from 'node:test';
import assert from 'node:assert/strict';
import { WORD_COLORS, wordColor } from '../src/lib/word-colors.js';

const rgb = (hex) => [0, 2, 4].map((offset) => parseInt(hex.slice(1 + offset, 3 + offset), 16));
const distance = (a, b) => Math.hypot(...rgb(a).map((channel, i) => channel - rgb(b)[i]));

test('joined-word colours are unique and visibly separated', () => {
  assert.equal(new Set(WORD_COLORS).size, WORD_COLORS.length);
  for (let i = 0; i < WORD_COLORS.length; i += 1) {
    assert.ok(
      distance(WORD_COLORS[i], wordColor(i + 1)) > 140,
      `${WORD_COLORS[i]} and ${wordColor(i + 1)} are too similar for adjacent letters`
    );
  }
});

test('the palette repeats predictably for longer words', () => {
  assert.equal(wordColor(0), wordColor(WORD_COLORS.length));
  assert.equal(wordColor(WORD_COLORS.length + 1), wordColor(1));
});
