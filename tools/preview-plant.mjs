/**
 * Draws every stage of the growing plant onto one sheet, to be looked at.
 *
 * Nothing here asserts. Whether a plant looks like a plant is a question only a
 * person can answer, and the alternative is playing a game to level nine to
 * find out what level nine looks like. Same reasoning as preview-glyphs.mjs and
 * preview-music.mjs.
 *
 * Two sheets: every growth step of one seed, and the same full-grown step in
 * all six, plus the row of finished trees at a few counts.
 *
 * Usage: npm run dev &  then  node tools/preview-plant.mjs [outdir] [baseUrl]
 */

import fs from 'node:fs';
import path from 'node:path';
import { openApp, step } from './harness.mjs';

const OUT = process.argv[2] || 'screenshots';
fs.mkdirSync(OUT, { recursive: true });

const { page, finish } = await openApp({
  name: 'plant preview',
  // Named, because argument one is the output directory here and openApp would
  // otherwise read it as the address of the app.
  url: process.argv[3] || process.env.APP_URL || 'http://localhost:5173',
  context: { viewport: { width: 1280, height: 900 }, deviceScaleFactor: 2 },
});

/**
 * Lays textures out in a scene of its own.
 *
 * Drawn through the real module rather than a copy of its maths, so what is on
 * the sheet is what the app puts on screen.
 */
async function sheet(file, plan) {
  await page.evaluate(async (spec) => {
    const plant = await import('/src/lib/plant.js');
    const game = window.__game;
    for (const scene of game.scene.getScenes(true)) game.scene.stop(scene.scene.key);
    if (game.scene.getScene('Preview')) game.scene.remove('Preview');

    game.scene.add(
      'Preview',
      {
        create() {
          this.cameras.main.setBackgroundColor('#dff2fb');
          for (const item of spec.items) {
            const key =
              item.kind === 'orchard'
                ? plant.orchardTexture(this, item.trees)
                : plant.plantTexture(
                    this,
                    plant.SPECIES.find((s) => s.id === item.species),
                    item.step,
                    Boolean(item.fruiting)
                  );
            const image = this.add.image(item.x, item.y, key).setOrigin(0.5, 1);
            image.setScale(item.scale);
            this.add
              .text(item.x, item.y + 8, item.label, { fontSize: '16px', color: '#40566a' })
              .setOrigin(0.5, 0);
          }
        },
      },
      true
    );
  }, plan);

  await page.waitForTimeout(600);
  const file2 = path.join(OUT, file);
  await page.screenshot({ path: file2 });
  step(`wrote ${file2}`);
}

// Every step of the first seed, plus the fruiting frame the level-up holds on.
const growth = { items: [] };
for (let s = 0; s <= 10; s++) {
  growth.items.push({
    kind: 'plant',
    species: 'apple',
    step: s,
    x: 60 + s * 100,
    y: 430,
    scale: 0.42,
    label: `${s}`,
  });
}
growth.items.push({
  kind: 'plant',
  species: 'apple',
  step: 10,
  fruiting: true,
  x: 1180,
  y: 430,
  scale: 0.42,
  label: 'fruit',
});
for (const [i, trees] of [1, 2, 4, 6, 8].entries()) {
  growth.items.push({
    kind: 'orchard',
    trees,
    x: 150 + i * 240,
    y: 706,
    scale: 0.44,
    label: `${trees} grown`,
  });
}
await sheet('plant-growth.png', growth);

// One seed each, full grown and fruiting, so the six read as six.
const seeds = {
  items: ['apple', 'orange', 'lemon', 'plum', 'pomegranate', 'mango'].map((id, i) => ({
    kind: 'plant',
    species: id,
    step: 10,
    fruiting: true,
    x: 110 + i * 210,
    y: 620,
    scale: 0.62,
    label: id,
  })),
};
await sheet('plant-seeds.png', seeds);

await finish();
