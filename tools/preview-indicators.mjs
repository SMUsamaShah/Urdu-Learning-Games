/* Draws every indicator, at every stage, onto one sheet to be looked at. */

import fs from 'node:fs';
import path from 'node:path';
import { openApp, step } from './harness.mjs';

const OUT = process.argv[2] || 'screenshots';
fs.mkdirSync(OUT, { recursive: true });

const { page, finish } = await openApp({
  name: 'indicator preview',
  // Named, because argument one is the output directory here and openApp would otherwise read it as the address of the app.
  url: process.argv[3] || process.env.APP_URL || 'http://localhost:5173',
  context: { deviceScaleFactor: 2 },
});

/* Lays a row of indicators out in a scene of its own. */
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

/* The rail's own box, read from the app rather than typed here. */
const RAIL_BOX = await page.evaluate(async () => {
  const { RAIL, DESIGN } = await import('/src/lib/theme.js');
  // Matching TOP and FOOT in src/lib/rail.js: the home button's corner, and a little air at the bottom.
  return { width: RAIL.width, height: DESIGN.height - 132 - 18 };
});

const place = (i) => ({
  width: RAIL_BOX.width,
  height: RAIL_BOX.height,
  x: RAIL_BOX.width / 2 + 8 + i * (RAIL_BOX.width + 12),
  y: 690,
  scale: 0.9,
});

for (const id of ['vine', 'tree', 'climber', 'bar', 'glass']) {
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

  // Full, sampled across the twenty levels a run cycles through.
  await sheet(`indicator-${id}-levels.png`, {
    indicator: id,
    items: [0, 3, 7, 11, 15, 19].map((level, i) => ({
      ...place(i),
      fraction: 1,
      level,
      label: `level ${level + 1}`,
    })),
  });
}

await finish();
