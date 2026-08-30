import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { WORD_COLORS, wordColor } from '../src/lib/word-colors.js';

const WORD_GLYPHS = Object.values(
  JSON.parse(readFileSync(new URL('../content/glyphs.json', import.meta.url), 'utf8')).words
);

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
const luminance = (color) => {
  const channels = rgbFromHsl(color)
    .map((channel) => channel / 255)
    .map((channel) => (channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4));
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
};

const linearRgb = (color) =>
  rgbFromHsl(color)
    .map((channel) => channel / 255)
    .map((channel) => (channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4));

const oklab = (color) => {
  const [red, green, blue] = linearRgb(color);
  const l = Math.cbrt(0.4122214708 * red + 0.5363325363 * green + 0.0514459929 * blue);
  const m = Math.cbrt(0.2119034982 * red + 0.6806995451 * green + 0.1073969566 * blue);
  const s = Math.cbrt(0.0883024619 * red + 0.2817188376 * green + 0.6299787005 * blue);
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
};

const perceptualDistance = (a, b) =>
  Math.hypot(...oklab(a).map((channel, index) => channel - oklab(b)[index]));

test('joined-word colours are unique and visibly separated', () => {
  assert.equal(new Set(WORD_COLORS).size, WORD_COLORS.length);
  for (let i = 0; i < WORD_COLORS.length; i += 1) {
    const next = wordColor(i + 1);
    assert.ok(
      perceptualDistance(WORD_COLORS[i], next) >= 0.3,
      `${WORD_COLORS[i]} and ${next} are too similar for adjacent letters`
    );
  }
});

test('no two palette colours are easily confused', () => {
  for (let i = 0; i < WORD_COLORS.length; i += 1) {
    for (let j = i + 1; j < WORD_COLORS.length; j += 1) {
      assert.ok(
        perceptualDistance(WORD_COLORS[i], WORD_COLORS[j]) >= 0.16,
        `${WORD_COLORS[i]} and ${WORD_COLORS[j]} are too similar`
      );
    }
  }
});

test('every taught word has a different colour available for each letter', () => {
  for (const glyph of WORD_GLYPHS) {
    assert.ok(
      glyph.clusters.length <= WORD_COLORS.length,
      `a ${glyph.clusters.length}-letter word needs more colours`
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

test('vivid fills keep enough separation from the white word plate', () => {
  for (const color of WORD_COLORS) {
    assert.ok(1.05 / (luminance(color) + 0.05) >= 3.3, `${color} is too pale for the word plate`);
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
