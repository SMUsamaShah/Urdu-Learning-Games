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

import { uiGlyph, uiGlyphs } from './content.js';
import { addGlyph, fitEmAlone, glyphMetrics } from './glyph.js';
import { COLORS, DESIGN, label } from './theme.js';

const RIBBON = 0x2f7fd6;
const RIBBON_DARK = 0x1d5aa8;

/**
 * Every instruction the ribbon can show.
 *
 * Listed rather than discovered, because the text has to be measured before any
 * of it is drawn: all seven are set at one em so a child sees the same size of
 * writing on every screen, and the em that fits is decided by the most demanding
 * of them. A scene passing an id that is not here still renders, just not to
 * scale — tests/ui-strings.test.mjs keeps the list honest.
 */
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
  // And the praise, because the ribbon is where it is shown: wellDone() swaps
  // the instruction for one of these. Listed out rather than spread in from
  // praise.js so that a phrase added there and forgotten here is caught — see
  // tests/praise.test.mjs. Measuring all eight alongside the instructions costs
  // the instructions 0.7% of their em, which is the price of بالکل ٹھیک never
  // running off the end of the ribbon.
  'well-done',
  'bohat-achay',
  'kamal',
  'zabardast',
  'wah',
  'shandaar',
  'bilkul-theek',
  'aafreen',
];

/**
 * The box the writing is fitted into, and the ribbon's minimum height.
 *
 * The ribbon grows to fit its text rather than the text shrinking to fit the
 * ribbon, because Nastaliq is not a horizontal script: "کتنے ہیں؟" stacks its
 * two words almost two ems above the baseline while "جوڑے ملاؤ" barely reaches
 * one, so a bar sized for the short one crops the tall one and a bar sized for
 * the tall one leaves the short one swimming.
 *
 * What must NOT vary is the size of the letters themselves, which is the whole
 * point of measuring the set: fitting each instruction to a fixed bar instead
 * drew لکھو at nearly twice the size of کتنے ہیں؟, on screens a child moves
 * between one after the other.
 */
const TEXT_BOX = { width: 460, height: 104 };
const MIN_HEIGHT = 78;

/**
 * A ribbon tail, as one polygon including its notch.
 *
 * Drawn as a single shape rather than a rectangle with a triangle punched out
 * of it, because there is scenery behind the ribbon and punching a hole would
 * mean knowing what colour to fill it with.
 */
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

  const { em } = fitEmAlone(uiGlyphs(INSTRUCTIONS), TEXT_BOX.width, TEXT_BOX.height);

  banner.setInstruction = (ui, roman) => {
    for (const item of text) item.destroy();
    text = [];

    const glyph = uiGlyph(ui);
    const metrics = glyph ? glyphMetrics(glyph, em) : { width: 0, height: 0 };
    // Sized to its contents in both directions. There is no shared baseline
    // here, unlike the menu tiles: each instruction is alone on its own screen,
    // so the ribbon around it is the reference the eye uses and centring the
    // writing in that ribbon is what looks deliberate.
    const width = Math.max(300, Math.min(660, metrics.width + 150));
    const height = Math.max(MIN_HEIGHT, metrics.height + (roman ? 44 : 26));
    // Grows downwards from a fixed top edge rather than outwards from its
    // centre. The ribbon is the topmost thing on every game screen, so a taller
    // instruction growing both ways runs off the top of the canvas — کتنے ہیں؟
    // is half again as tall as the rest and did exactly that.
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
      // No outline on the letters here, unlike everywhere else in the app. The
      // outline exists so a letter survives sitting on a colour that varies;
      // this one sits on a single flat blue, and an outline heavy enough to see
      // simply fills in the thin strokes of Nastaliq until the word reads black.
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

  // Drops in rather than appearing. It is the first thing on screen each time a
  // game opens, and movement is what makes a child look at it.
  banner.setY(y - 110);
  scene.tweens.add({ targets: banner, y, duration: 420, ease: 'Back.easeOut' });

  return banner;
}
