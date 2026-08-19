/**
 * The colours the rail's indicators are drawn in.
 *
 * These used to be six hand-picked hex strings and are now twenty generated
 * ones, which trades one failure mode for another. Hand-picked, the risk was
 * choosing badly — a white jasmine went into the first six and was invisible on
 * the rail's cream panel. Generated, the risk is that the arithmetic quietly
 * produces a colour nobody would have chosen: two levels the same, or a hue
 * that lands on the background.
 *
 * Both of those are arithmetic, so they are checked here rather than by looking
 * at a screenshot. What a screenshot is still for — whether twenty flowers up a
 * cane is a record or a speckle — is `npm run preview-indicators`.
 *
 * Run: npm test
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  contrast,
  levelColour,
  levelHue,
  levelTint,
  LEVEL_COLOURS,
  LEVEL_CYCLE,
  PANEL,
} from '../src/lib/indicators/canvas.js';
import { VARIETIES, varietyFor } from '../src/lib/indicators/greenery.js';

/**
 * Below this a shape is hard to pick out from the panel behind it.
 *
 * Lower than a text ratio on purpose: these are large solid shapes with their
 * own outlines and highlights. `readable()` in canvas.js walks a colour's
 * lightness down until it clears exactly this, so the test and the generator
 * agree by construction — what it is really asserting is that the generator was
 * *applied*, to every colour, including the ones added later.
 */
const MIN_CONTRAST = 2.4;

/** Two colours closer than this on the wheel read as the same colour. */
const MIN_HUE_GAP = 12;

describe('level colours', () => {
  test('there are as many as the cycle claims, and they are all different', () => {
    assert.equal(LEVEL_COLOURS.length, LEVEL_CYCLE);
    assert.equal(new Set(LEVEL_COLOURS).size, LEVEL_CYCLE);
  });

  test('every one is visible against the rail panel', () => {
    for (const [i, colour] of LEVEL_COLOURS.entries()) {
      const ratio = contrast(colour, PANEL);
      assert.ok(
        ratio >= MIN_CONTRAST,
        `level ${i + 1} is ${colour}, ${ratio.toFixed(2)} against ${PANEL}`
      );
    }
  });

  test('no hue is green', () => {
    // A green flower on a green vine among green leaves is a flower nobody can
    // see, which is why the wheel skips this quarter. See levelHue().
    for (let i = 0; i < LEVEL_CYCLE; i++) {
      const hue = levelHue(i);
      assert.ok(hue <= 75 || hue >= 165, `level ${i + 1} is at hue ${Math.round(hue)}`);
    }
  });

  test('consecutive levels are far apart on the wheel', () => {
    // The comparison a child actually makes is with the level before, so being
    // evenly spread over twenty is not enough — they have to be spread in the
    // order they arrive.
    for (let i = 1; i < LEVEL_CYCLE; i++) {
      const gap = Math.abs(levelHue(i) - levelHue(i - 1));
      const round = Math.min(gap, 360 - gap);
      assert.ok(round >= 60, `levels ${i} and ${i + 1} are ${Math.round(round)}° apart`);
    }
  });

  test('the cycle wraps rather than running out', () => {
    assert.equal(levelColour(LEVEL_CYCLE), levelColour(0));
    assert.equal(levelColour(LEVEL_CYCLE * 3 + 7), levelColour(7));
    // Negative levels cannot happen, but a modulo that goes wrong there is the
    // kind of thing that only shows up as a crash on somebody's device.
    assert.equal(levelColour(-1), levelColour(LEVEL_CYCLE - 1));
    assert.equal(levelTint(0), Number.parseInt(levelColour(0).slice(1), 16));
  });
});

describe('the plants', () => {
  test('there is one per level of the cycle, each named once', () => {
    assert.equal(VARIETIES.length, LEVEL_CYCLE);
    assert.equal(new Set(VARIETIES.map((v) => v.id)).size, LEVEL_CYCLE);
  });

  test('every flower is its level colour, so all the indicators agree', () => {
    for (const [i, variety] of VARIETIES.entries()) {
      assert.equal(variety.flower, LEVEL_COLOURS[i], `${variety.id} is off the wheel`);
    }
  });

  test('every flower is visible, and every highlight is visible on its flower', () => {
    for (const variety of VARIETIES) {
      assert.ok(
        contrast(variety.flower, PANEL) >= MIN_CONTRAST,
        `${variety.id}'s flower vanishes on the panel`
      );
      assert.ok(
        contrast(variety.gloss, variety.flower) >= 1.5,
        `${variety.id}'s highlight vanishes on its own petal`
      );
    }
  });

  test('no two adjacent plants share a leaf colour', () => {
    for (let i = 1; i < VARIETIES.length; i++) {
      assert.notEqual(
        VARIETIES[i].leaf,
        VARIETIES[i - 1].leaf,
        `${VARIETIES[i].id} has the same leaf as ${VARIETIES[i - 1].id}`
      );
    }
  });

  test('the planting order wraps', () => {
    assert.equal(varietyFor(LEVEL_CYCLE).id, VARIETIES[0].id);
    assert.equal(varietyFor(-1).id, VARIETIES[LEVEL_CYCLE - 1].id);
  });
});

describe('hue spacing', () => {
  test('no two levels land on the same colour', () => {
    const hues = Array.from({ length: LEVEL_CYCLE }, (unused, i) => levelHue(i)).sort(
      (a, b) => a - b
    );
    for (let i = 1; i < hues.length; i++) {
      assert.ok(
        hues[i] - hues[i - 1] >= MIN_HUE_GAP,
        `two levels sit at ${Math.round(hues[i - 1])}° and ${Math.round(hues[i])}°`
      );
    }
  });
});
