import { test } from 'node:test';
import assert from 'node:assert/strict';
import { WORD_COLORS, wordColor } from '../src/lib/word-colors.js';

const rgb = (hex) => [0, 2, 4].map((offset) => parseInt(hex.slice(1 + offset, 3 + offset), 16));
const distance = (a, b) => Math.hypot(...rgb(a).map((channel, i) => channel - rgb(b)[i]));
const luminance = (hex) => {
  const channels = rgb(hex)
    .map((channel) => channel / 255)
    .map((channel) => (channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4));
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
};

test('joined-word colours are unique and visibly separated', () => {
  assert.equal(new Set(WORD_COLORS).size, WORD_COLORS.length);
  for (let i = 0; i < WORD_COLORS.length; i += 1) {
    assert.ok(
      distance(WORD_COLORS[i], wordColor(i + 1)) > 140,
      `${WORD_COLORS[i]} and ${wordColor(i + 1)} are too similar for adjacent letters`
    );
  }
});

test('every colour stays readable on a white word', () => {
  for (const color of WORD_COLORS) {
    assert.ok(1.05 / (luminance(color) + 0.05) >= 4.5, `${color} needs more contrast with white`);
  }
});

test('the palette repeats predictably for longer words', () => {
  assert.equal(wordColor(0), wordColor(WORD_COLORS.length));
  assert.equal(wordColor(WORD_COLORS.length + 1), wordColor(1));
});
