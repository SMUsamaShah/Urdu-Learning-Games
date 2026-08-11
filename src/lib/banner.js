/**
 * The instruction ribbon across the top of a game.
 *
 * Every preschool app of this kind puts the one thing you are supposed to do
 * on a ribbon at the top, in the same place, on every screen. It is worth
 * copying for a reason that is not decorative: this app's audience cannot read,
 * so the instruction is really being read by whoever handed over the phone, and
 * a parent needs to find it in one glance without hunting.
 *
 * The Urdu goes through the baked outlines like all the other Urdu in the app —
 * see src/lib/glyph.js for why none of it is Phaser.Text.
 */

import { uiGlyph } from './content.js';
import { addGlyph, fitGlyphHeight, glyphWidth } from './glyph.js';
import { COLORS, DESIGN, label } from './theme.js';

const RIBBON = 0x2f7fd6;
const RIBBON_DARK = 0x1d5aa8;

/**
 * How tall the Urdu is allowed to be, and the ribbon's minimum height.
 *
 * The ribbon grows to fit its text rather than the text shrinking to fit the
 * ribbon, because Nastaliq is not a horizontal script: "کتنے ہیں؟" descends a
 * long way below its own baseline, so a glyph squeezed into a short bar ends up
 * with hairline strokes long before it runs out of width.
 */
const TEXT_HEIGHT = 62;
const MIN_HEIGHT = 78;

/**
 * A ribbon tail, as one polygon including its notch.
 *
 * Drawn as a single shape rather than a rectangle with a triangle punched out
 * of it, because there is scenery behind the ribbon and punching a hole would
 * mean knowing what colour to fill it with.
 */
function tail(g, side, innerX, height) {
  const out = innerX + side * 52;
  const notch = innerX + side * 34;
  g.fillStyle(RIBBON_DARK, 1);
  g.fillPoints(
    [
      { x: innerX, y: -height / 2 + 12 },
      { x: out, y: -height / 2 + 24 },
      { x: notch, y: 4 },
      { x: out, y: height / 2 + 16 },
      { x: innerX, y: height / 2 + 2 },
    ],
    true
  );
}

/**
 * Adds the ribbon and returns it, so a scene can swap the text between rounds.
 *
 * @param {Phaser.Scene} scene
 * @param {object} config
 * @param {string} config.ui id of a string in content/ui.json
 * @param {string} [config.roman] English gloss, for the parent
 * @param {number} [config.y]
 * @returns {Phaser.GameObjects.Container} with `setInstruction(ui, roman)`
 */
export function addBanner(scene, config) {
  const { y = 60 } = config;
  const banner = scene.add.container(DESIGN.width / 2, y).setDepth(20);

  const plate = scene.add.graphics();
  banner.add(plate);
  /** @type {Phaser.GameObjects.GameObject[]} */
  let text = [];

  banner.setInstruction = (ui, roman) => {
    for (const item of text) item.destroy();
    text = [];

    const glyph = uiGlyph(ui);
    const textHeight = glyph ? Math.round(fitGlyphHeight(glyph, 460, TEXT_HEIGHT)) : 0;
    const textWidth = glyph ? glyphWidth(glyph, textHeight) : 0;
    // Sized to its contents in both directions: "لکھو" and "کتنے ہیں؟" are very
    // different shapes, and one fixed bar would either crop one or leave the
    // other swimming.
    const width = Math.max(300, Math.min(660, textWidth + 150));
    const height = Math.max(MIN_HEIGHT, textHeight + (roman ? 44 : 26));

    plate.clear();
    tail(plate, -1, -width / 2 + 14, height);
    tail(plate, 1, width / 2 - 14, height);

    plate.fillStyle(COLORS.shadow, 0.2);
    plate.fillRoundedRect(-width / 2, -height / 2 + 7, width, height, 22);
    plate.fillStyle(RIBBON, 1);
    plate.fillRoundedRect(-width / 2, -height / 2, width, height, 22);
    plate.lineStyle(5, 0xffffff, 0.9);
    plate.strokeRoundedRect(-width / 2 + 4, -height / 2 + 4, width - 8, height - 8, 18);
    plate.lineStyle(3, COLORS.outline, 0.85);
    plate.strokeRoundedRect(-width / 2, -height / 2, width, height, 22);

    if (glyph) {
      // No outline on the letters here, unlike everywhere else in the app. The
      // outline exists so a letter survives sitting on a colour that varies;
      // this one sits on a single flat blue, and an outline heavy enough to see
      // simply fills in the thin strokes of Nastaliq until the word reads black.
      const item = addGlyph(scene, 0, roman ? -10 : 0, `banner:${ui}:${textHeight}`, glyph, {
        height: textHeight,
        color: COLORS.onColor,
      });
      banner.add(item);
      text.push(item);
    }
    if (roman) {
      const item = label(scene, 0, height / 2 - 17, roman, {
        size: 14,
        color: COLORS.onColorDim,
      });
      banner.add(item);
      text.push(item);
    }
  };

  banner.setInstruction(config.ui, config.roman);

  // Drops in rather than appearing. It is the first thing on screen each time a
  // game opens, and movement is what makes a child look at it.
  banner.setY(y - 110);
  scene.tweens.add({ targets: banner, y, duration: 420, ease: 'Back.easeOut' });

  return banner;
}
