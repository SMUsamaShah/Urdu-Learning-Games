/* The instruction ribbon across the top of a game. */

import { uiGlyph, uiGlyphs } from './content.js';
import { addGlyph, fitEmAlone, glyphMetrics } from './glyph.js';
import { COLORS, label, PLAY } from './theme.js';

const RIBBON = 0x2f7fd6;
const RIBBON_DARK = 0x1d5aa8;

/* Every instruction the ribbon can show. */
export const INSTRUCTIONS = [
  'pop-balloon',
  'match-pairs',
  'fill-letter',
  'find-letter',
  'how-many',
  'whats-next',
  'find-picture',
  'join-forms',
  'starts-with',
  'knock-door',
  'tap-all',
  'fill-gaps',
  'build-letter',
  'catch-letter',
  'sort-letters',
  'tap-quick',
  'odd-one',
  'in-order',
  'colour-in',
  'join-picture',
  'count-gaps',
  'find-hidden',
  'catch-bounce',
  'build-word',
  'fill-letter-word',
  'join-word',
  // And the praise, because the ribbon is where it is shown: wellDone() swaps the instruction for one of these.
  'well-done',
  'bohat-achay',
  'kamal',
  'zabardast',
  'wah',
  'shandaar',
  'bilkul-theek',
  'aafreen',
];

/* The box the writing is fitted into, and the ribbon's minimum height. */
const TEXT_BOX = { width: 460, height: 104 };
const MIN_HEIGHT = 78;

/* A ribbon tail, as one polygon including its notch. */
function tail(g, side, innerX, height, middle) {
  const out = innerX + side * 52;
  const notch = innerX + side * 34;
  g.fillStyle(RIBBON_DARK, 1);
  g.fillPoints(
    [
      { x: innerX, y: middle - height / 2 + 12 },
      { x: out, y: middle - height / 2 + 24 },
      { x: notch, y: middle + 4 },
      { x: out, y: middle + height / 2 + 16 },
      { x: innerX, y: middle + height / 2 + 2 },
    ],
    true
  );
}

/** Adds the ribbon and returns it, so a scene can swap the text between rounds.
 * @param {Phaser.Scene} scene
 * @param {object} config
 * @param {string} config.ui id of a string in content/ui.json
 * @param {string} [config.roman] English gloss, for the parent
 * @param {number} [config.y]
 * @returns {Phaser.GameObjects.Container} with `setInstruction(ui, roman)`
 */
export function addBanner(scene, config) {
  const { y = 60 } = config;
  const banner = scene.add.container(PLAY.centerX, y).setDepth(20);

  const plate = scene.add.graphics();
  banner.add(plate);
  /** @type {Phaser.GameObjects.GameObject[]} */
  let text = [];

  const { em } = fitEmAlone(uiGlyphs(INSTRUCTIONS), TEXT_BOX.width, TEXT_BOX.height);

  banner.setInstruction = (ui, roman) => {
    for (const item of text) item.destroy();
    text = [];

    const glyph = uiGlyph(ui);
    const metrics = glyph ? glyphMetrics(glyph, em) : { width: 0, height: 0 };
    // Sized to its contents in both directions.
    const width = Math.max(300, Math.min(660, metrics.width + 150));
    const height = Math.max(MIN_HEIGHT, metrics.height + (roman ? 44 : 26));
    // Grows downwards from a fixed top edge rather than outwards from its centre.
    const top = -MIN_HEIGHT / 2;
    const middle = top + height / 2;

    plate.clear();
    tail(plate, -1, -width / 2 + 14, height, middle);
    tail(plate, 1, width / 2 - 14, height, middle);

    plate.fillStyle(COLORS.shadow, 0.2);
    plate.fillRoundedRect(-width / 2, top + 7, width, height, 22);
    plate.fillStyle(RIBBON, 1);
    plate.fillRoundedRect(-width / 2, top, width, height, 22);
    plate.lineStyle(5, 0xffffff, 0.9);
    plate.strokeRoundedRect(-width / 2 + 4, top + 4, width - 8, height - 8, 18);
    plate.lineStyle(3, COLORS.outline, 0.85);
    plate.strokeRoundedRect(-width / 2, top, width, height, 22);

    if (glyph) {
      // No outline on the letters here, unlike everywhere else in the app.
      const item = addGlyph(
        scene,
        0,
        middle - (roman ? 10 : 0),
        `banner:em${Math.round(em)}:${ui}`,
        glyph,
        { em, color: COLORS.onColor }
      );
      banner.add(item);
      text.push(item);
    }
    if (roman) {
      const item = label(scene, 0, top + height - 17, roman, {
        size: 14,
        color: COLORS.onColorDim,
      });
      banner.add(item);
      text.push(item);
    }
  };

  banner.setInstruction(config.ui, config.roman);

  // Drops in rather than appearing.
  banner.setY(y - 110);
  scene.tweens.add({ targets: banner, y, duration: 420, ease: 'Back.easeOut' });

  return banner;
}
