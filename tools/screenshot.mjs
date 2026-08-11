/**
 * Screenshots the running app so changes can be checked visually.
 *
 * Nothing here asserts; it just drives the app and writes PNGs. Automated tests
 * can tell you a glyph exists, but only looking at it tells you the Nastaliq is
 * right, and that is the thing most likely to be subtly wrong.
 *
 * Usage: npm run dev &  then  node tools/screenshot.mjs [outdir] [baseUrl]
 */

import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';
import { launchOptions } from './browser.mjs';

const OUT = process.argv[2] || 'screenshots';
const BASE = process.argv[3] || 'http://localhost:5173';

const VIEWPORTS = {
  phone: { width: 844, height: 390 },   // iPhone-ish, landscape
  tablet: { width: 1180, height: 820 },
};

fs.mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch(launchOptions());

for (const [name, viewport] of Object.entries(VIEWPORTS)) {
  const page = await browser.newPage({ viewport, deviceScaleFactor: 2 });
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));

  await page.goto(BASE, { waitUntil: 'networkidle' });
  await waitForScene(page, 'Home');
  await page.screenshot({ path: path.join(OUT, `${name}-home.png`) });

  await startScene(page, 'Flashcards');
  await page.screenshot({ path: path.join(OUT, `${name}-flashcards.png`) });

  // A non-joining letter, to confirm the forms row adapts rather than always
  // drawing four boxes. `dal` is index 10 in the alphabetical sequence.
  await selectLetter(page, 10);
  await page.screenshot({ path: path.join(OUT, `${name}-flashcards-nonjoiner.png`) });

  // do-chashmi-he: a letter whose word teaches it mid-word, not at the start.
  await selectLetter(page, 34);
  await page.screenshot({ path: path.join(OUT, `${name}-flashcards-midword.png`) });

  if (errors.length) {
    console.error(`\n${name} produced ${errors.length} console error(s):`);
    for (const e of errors) console.error('  ' + e);
    process.exitCode = 1;
  }
  await page.close();
}

await browser.close();
console.log(`Screenshots written to ${OUT}/`);

async function waitForScene(page, key) {
  await page.waitForFunction(
    (k) => window.__game?.scene.isActive(k),
    key,
    { timeout: 20000 }
  );
  await page.waitForTimeout(400);
}

async function startScene(page, key) {
  await page.evaluate((k) => {
    const game = window.__game;
    game.scene.getScenes(true).forEach((s) => game.scene.stop(s.scene.key));
    game.scene.start(k);
  }, key);
  await waitForScene(page, key);
}

async function selectLetter(page, index) {
  await page.evaluate((i) => {
    window.__game.scene.getScene('Flashcards').select(i);
  }, index);
  await page.waitForTimeout(450);
}
