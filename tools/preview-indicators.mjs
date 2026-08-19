/**
 * Draws every indicator, at every stage, onto one sheet to be looked at.
 *
 * Nothing here asserts. Whether a plant looks like a plant, or a glass like a
 * glass, is a question only a person can answer, and the alternative is playing
 * a game to level nine to find out what level nine looks like. Same reasoning
 * as preview-glyphs.mjs and preview-music.mjs.
 *
 * Two sheets per indicator: the fill from empty to full, and the same full
 * frame in each of the six level colours.
 *
 * ## A frame drawn in pieces is the sheet, not the plant
 *
 * In headless Chromium the taller plant frames sometimes come out torn — a
 * canopy split in two and shifted, half a pot. It follows the height of the
 * frame rather than how many there are: the short ones are always whole and
 * the full-grown ones are the ones that break. Six to a sheet instead of
 * twelve, staggering the work over frames, and building all the labels before
 * any of the frames each moved it without curing it.
 *
 * It is a property of this renderer under this harness, not of the indicator.
 * The same frames drawn one to a screen — which is all the app ever does — are
 * whole every time, in the rail on all twenty-four game screens and on the
 * menu. Read a torn frame here as noise and run it again; do not go changing
 * the drawing to chase it.
 *
 * Usage: npm run dev &  then  node tools/preview-indicators.mjs [outdir] [baseUrl]
 */

import fs from 'node:fs';
import path from 'node:path';
import { openApp, step } from './harness.mjs';

const OUT = process.argv[2] || 'screenshots';
fs.mkdirSync(OUT, { recursive: true });

const { page, finish } = await openApp({
  name: 'indicator preview',
  // Named, because argument one is the output directory here and openApp would
  // otherwise read it as the address of the app.
  url: process.argv[3] || process.env.APP_URL || 'http://localhost:5173',
  context: { deviceScaleFactor: 2 },
});

/**
 * Lays a row of indicators out in a scene of its own.
 *
 * Built through the real modules rather than a copy of their maths, so what is
 * on the sheet is what the rail puts on screen.
 */
async function sheet(file, plan) {
  await page.evaluate(async (spec) => {
    const indicators = await import('/src/lib/indicators/index.js');
    const game = window.__game;
    for (const scene of game.scene.getScenes(true)) game.scene.stop(scene.scene.key);
    if (game.scene.getScene('Preview')) game.scene.remove('Preview');

    game.scene.add(
      'Preview',
      {
        create() {
          this.cameras.main.setBackgroundColor('#f6ecd8');
          // Every indicator first, and every label afterwards.
          //
          // A sheet builds a dozen canvas textures where a real screen builds
          // one or two, and a Phaser Text is itself a canvas texture. Creating
          // the two kinds alternately drew several frames in pieces — a torn
          // canopy here, half a pot there — while the same twelve built in one
          // run come out clean. Nothing in the app interleaves them like that,
          // so this is a fix for the sheet rather than for the plant.
          // Labels first, then the frames.
          //
          // A Phaser Text carries a canvas texture of its own, and building one
          // after a frame has been baked leaves that frame drawn in pieces here
          // — a torn canopy, half a pot — reliably enough to reproduce. Sheets
          // with no labels at all never showed it. Making all the text before
          // any of the frames is what makes this come out whole.
          for (const item of spec.items) {
            this.add
              .text(item.x, item.y + 10, item.label, {
                fontSize: '15px',
                color: '#40566a',
              })
              .setOrigin(0.5, 0);
          }

          for (const item of spec.items) {
            const el = indicators
              .indicatorModule(spec.indicator)
              .still(this, { width: item.width, height: item.height }, item);
            el.setPosition(item.x, item.y);
            el.setScale(item.scale ?? 1);
          }
        },
      },
      true
    );
  }, plan);

  await page.waitForTimeout(900);
  const to = path.join(OUT, file);
  await page.screenshot({ path: to });
  step(`wrote ${to}`);
}

const place = (i) => ({
  width: 200,
  height: 380,
  x: 150 + i * 190,
  y: 620,
  scale: 0.9,
});

for (const id of ['plant', 'bar', 'glass']) {
  // Empty to full, at one level.
  await sheet(`indicator-${id}-filling.png`, {
    indicator: id,
    items: [0, 1, 2, 3, 4, 5].map((i) => ({
      ...place(i),
      fraction: i / 5,
      level: 0,
      label: `${i}/5`,
    })),
  });

  // Full, in each of the six colours a run of levels cycles through.
  await sheet(`indicator-${id}-levels.png`, {
    indicator: id,
    items: [0, 1, 2, 3, 4, 5].map((level) => ({
      ...place(level),
      fraction: 1,
      level,
      label: `level ${level + 1}`,
    })),
  });
}

await finish();
