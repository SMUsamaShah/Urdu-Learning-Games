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
 * ## A frame drawn in pieces is the sheet, not the indicator
 *
 * The pot plant that used to be the first indicator baked one large canvas per
 * step of growth, and in headless Chromium the tall ones sometimes came out
 * torn — a canopy split in two and shifted, half a pot. It followed the height
 * of the canvas rather than how many were built: the short ones were always
 * whole. Six frames to a sheet instead of twelve, staggering the work, and
 * building every label before any of the frames each moved it without curing
 * it.
 *
 * Nothing on these sheets bakes a canvas that big any more — the vine is
 * assembled from small pieces — and it has not been seen since. If it comes
 * back, read a torn frame here as noise and run it again; it is a property of
 * this renderer under this harness, and the same pieces drawn one screen at a
 * time, which is all the app ever does, are whole every time. Do not go
 * changing a drawing to chase it.
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
          // Labels first, then the frames. A Phaser Text carries a canvas
          // texture of its own, and building one after a frame has been baked
          // used to leave that frame drawn in pieces here, reliably enough to
          // reproduce; sheets with no labels at all never showed it. Making all
          // the text before any of the frames is what made it come out whole.
          // See the note at the top.
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

/**
 * The rail's own box, near enough: 200 wide, 570 tall.
 *
 * It used to be 380 tall here, which is exactly how an indicator that filled
 * two thirds of the real rail passed a look at this sheet. The sheet is the
 * only place the shape of the thing is judged, so it has to be the shape.
 */
const place = (i) => ({
  width: 200,
  height: 560,
  x: 100 + i * 196,
  y: 690,
  scale: 0.9,
});

for (const id of ['vine', 'tree', 'bar', 'glass']) {
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
