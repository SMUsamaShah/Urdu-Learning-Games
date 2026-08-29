import { test } from 'node:test';
import assert from 'node:assert/strict';
import { WORD_COLORS, wordColor } from '../src/lib/word-colors.js';

const HSL = /^hsl\(\s*(\d+(?:\.\d+)?)\s*,\s*(\d+(?:\.\d+)?)%\s*,\s*(\d+(?:\.\d+)?)%\s*\)$/;
const hslValues = (color) => {
  const match = HSL.exec(color);
  assert.ok(match, `${color} should be an HSL colour`);
  return match.slice(1).map(Number);
};
const rgbFromHsl = (color) => {
  const [h, saturation, lightness] = hslValues(color);
  const s = saturation / 100;
  const l = lightness / 100;
  const hueChannel = (n) => {
    const k = (n + h / 30) % 12;
    const a = s * Math.min(l, 1 - l);
    return l - a * Math.max(-1, Math.min(k - 3, Math.min(9 - k, 1)));
  };
  return [0, 8, 4].map(hueChannel).map((channel) => Math.round(channel * 255));
};
const distance = (a, b) =>
  Math.hypot(...rgbFromHsl(a).map((channel, i) => channel - rgbFromHsl(b)[i]));
const luminance = (color) => {
  const channels = rgbFromHsl(color)
    .map((channel) => channel / 255)
    .map((channel) => (channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4));
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
};

test('joined-word colours are unique and visibly separated', () => {
  assert.equal(new Set(WORD_COLORS).size, WORD_COLORS.length);
  for (let i = 0; i < WORD_COLORS.length; i += 1) {
    const next = wordColor(i + 1);
    assert.ok(
      distance(WORD_COLORS[i], next) > 140 ||
        Math.abs(luminance(WORD_COLORS[i]) - luminance(next)) >= 0.05,
      `${WORD_COLORS[i]} and ${next} are too similar for adjacent letters`
    );
  }
});

test('the palette uses distinct HSL lightness levels', () => {
  const lightness = WORD_COLORS.map((color) => hslValues(color)[2]);
  assert.ok(new Set(lightness).size >= 4, 'the palette needs varied brightness levels');
  assert.ok(
    Math.min(
      ...lightness.map((value, index) =>
        Math.abs(value - lightness[(index + 1) % lightness.length])
      )
    ) >= 5
  );
});

test('every colour stays readable on a white word', () => {
  for (const color of WORD_COLORS) {
    assert.ok(1.05 / (luminance(color) + 0.05) >= 4.5, `${color} needs more contrast with white`);
  }
});

test('adjacent colours have a meaningful brightness difference', () => {
  const differences = WORD_COLORS.map((color, index) =>
    Math.abs(luminance(color) - luminance(wordColor(index + 1)))
  );

  assert.ok(
    Math.min(...differences) >= 0.05,
    `adjacent brightness differences are too small: ${differences.map((value) => value.toFixed(3))}`
  );
  assert.ok(
    Math.max(...WORD_COLORS.map(luminance)) - Math.min(...WORD_COLORS.map(luminance)) >= 0.12,
    'the palette needs a wider overall brightness range'
  );
});

test('the palette repeats predictably for longer words', () => {
  assert.equal(wordColor(0), wordColor(WORD_COLORS.length));
  assert.equal(wordColor(WORD_COLORS.length + 1), wordColor(1));
});
