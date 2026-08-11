/**
 * Drives the tracing game with a real pointer.
 *
 * This is the one game whose whole mechanic is input, so it cannot be checked
 * by poking scene state: the coverage grid, the reveal and the finish condition
 * all hang off actual mouse movement. Every stroke here is a genuine
 * mouse.down / move / up against the canvas.
 *
 * The checks are the ones that decide whether the game is playable at all:
 * every letter has something to trace, tracing raises coverage, finishing moves
 * on, starting again really starts again, and scribbling outside the letter
 * does nothing — because a child will do exactly that and must not be rewarded
 * for it.
 *
 * Waits on conditions rather than durations, for the reason in verify-games.mjs:
 * Phaser's clock runs at about half wall-clock speed under headless WebGL.
 *
 * Usage: npm run dev &  then  node tools/verify-trace.mjs [baseUrl]
 */

import { chromium } from 'playwright';
import { launchOptions } from './browser.mjs';

const APP = process.argv[2] || 'http://localhost:5173';

const fail = (msg) => {
  console.error('FAIL: ' + msg);
  process.exitCode = 1;
};
const step = (msg) => process.stderr.write(`· ${msg}\n`);

const watchdog = setTimeout(() => {
  console.error('FAIL: timed out after 240s');
  process.exit(1);
}, 240000);
watchdog.unref();

const browser = await chromium.launch(launchOptions());
const page = await browser.newPage({ viewport: { width: 1180, height: 820 } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));

await page.goto(APP, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => window.__game?.scene.isActive('Home'), null, {
  timeout: 30000,
});
await page.evaluate(() => {
  const game = window.__game;
  game.scene.getScenes(true).forEach((s) => game.scene.stop(s.scene.key));
  game.scene.start('Trace');
});
await page.waitForFunction(() => window.__game.scene.isActive('Trace'), null, {
  timeout: 20000,
});
await page.waitForTimeout(500);

const state = () =>
  page.evaluate(() => {
    const s = window.__game.scene.getScene('Trace');
    return {
      letter: s.letterId,
      inside: s.insideCount,
      coverage: s.coverage,
      locked: s.locked,
      index: s.index,
    };
  });

/** Where the letter sits, in page coordinates. */
const geometry = () =>
  page.evaluate(() => {
    const s = window.__game.scene.getScene('Trace');
    const rect = window.__game.canvas.getBoundingClientRect();
    return {
      x: s.inkOrigin.x,
      y: s.inkOrigin.y,
      w: s.inkSize.width,
      h: s.inkSize.height,
      left: rect.left,
      top: rect.top,
      scale: rect.width / 1280,
    };
  });

/** One horizontal sweep across the letter at a given fraction of its height. */
async function sweep(geo, fraction) {
  const toPage = (gx, gy) => [geo.left + gx * geo.scale, geo.top + gy * geo.scale];
  const y = geo.y + fraction * geo.h;
  const [x0, y0] = toPage(geo.x, y);
  await page.mouse.move(x0, y0);
  await page.mouse.down();
  for (let i = 1; i <= 12; i++) {
    const [xi, yi] = toPage(geo.x + (geo.w * i) / 12, y);
    await page.mouse.move(xi, yi);
  }
  await page.mouse.up();
}

// ------------------------------------------------ every letter is traceable

step('checking every letter has ink to trace');
const empties = await page.evaluate(() => {
  const scene = window.__game.scene.getScene('Trace');
  const bad = [];
  for (let i = 0; i < scene.sequence.length; i++) {
    scene.index = i;
    scene.buildLetter();
    if (scene.insideCount < 20) bad.push(`${scene.letterId}(${scene.insideCount})`);
  }
  scene.index = 0;
  scene.buildLetter();
  return bad;
});
if (empties.length) {
  fail(`letters with too little to trace: ${empties.join(', ')}`);
} else {
  step(`all letters have a traceable area`);
}

// ----------------------------------------------------------- tracing works

const before = await state();
if (before.coverage !== 0) fail(`a fresh letter starts at ${before.coverage} coverage`);

step(`tracing ${before.letter}`);
let geo = await geometry();
await sweep(geo, 0.5);
const afterOne = await state();
if (afterOne.coverage <= 0) fail('a stroke across the letter raised no coverage');
else step(`one stroke -> ${(afterOne.coverage * 100).toFixed(0)}% coverage`);

// ------------------------------------------------ outside the letter is free

step('checking a scribble outside the letter counts for nothing');
const outsideBefore = (await state()).coverage;
const toPage = (gx, gy) => [geo.left + gx * geo.scale, geo.top + gy * geo.scale];
// Well clear of the glyph, to the left of it.
const [ox, oy] = toPage(geo.x - 260, geo.y + geo.h / 2);
await page.mouse.move(ox, oy);
await page.mouse.down();
for (let i = 0; i < 10; i++) await page.mouse.move(ox, oy + i * 12);
await page.mouse.up();
const outsideAfter = (await state()).coverage;
if (outsideAfter !== outsideBefore) {
  fail(`scribbling outside changed coverage ${outsideBefore} -> ${outsideAfter}`);
} else {
  step('outside strokes ignored');
}

// ------------------------------------------------------------ start again

step('checking Start again clears the letter');
await page.evaluate(() => window.__game.scene.getScene('Trace').reset());
await page.waitForTimeout(300);
const afterReset = await state();
if (afterReset.coverage !== 0) fail(`Start again left ${afterReset.coverage} coverage`);
else step('Start again clears it');

// ------------------------------------------------------------- finishing

step('filling the letter to completion');
const target = (await state()).letter;
geo = await geometry();
for (let i = 0; i <= 26; i++) {
  await sweep(geo, i / 26);
  const now = await state();
  if (now.locked || now.letter !== target) break;
}

const finished = await page
  .waitForFunction(
    (was) => window.__game.scene.getScene('Trace').letterId !== was,
    target,
    { timeout: 25000 }
  )
  .then(() => true)
  .catch(() => false);

if (!finished) {
  const now = await state();
  fail(
    `covering ${target} did not move on (coverage ${(now.coverage * 100).toFixed(0)}%, ` +
      `locked=${now.locked})`
  );
} else {
  step(`${target} completed and moved on`);
}

const fresh = await state();
if (fresh.coverage !== 0) fail(`the next letter started at ${fresh.coverage} coverage`);

await page.screenshot({
  path: process.argv[3] || 'trace-check.png',
});

if (errors.length) {
  for (const e of errors) console.error('  console: ' + e);
  fail(`${errors.length} console error(s)`);
}

await browser.close();
clearTimeout(watchdog);
console.log(process.exitCode ? 'trace verification FAILED' : 'trace verification passed');
process.exit(process.exitCode ?? 0);
