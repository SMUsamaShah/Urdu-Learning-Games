/* Drives the writing screen with a real pointer, in both of its modes. */

import fs from 'node:fs';
import path from 'node:path';
import { fail, openApp, startScene, step } from './harness.mjs';
import { CONTENT_DIR } from './audio-keys.mjs';

const read = (name) => JSON.parse(fs.readFileSync(path.join(CONTENT_DIR, name), 'utf8'));
const glyphs = read('glyphs.json');
const strokes = read('strokes.json');
/* Letters whose guide a person has confirmed. */
const guided = Object.keys(strokes.letters).filter((id) => strokes.letters[id].corrected);

/* Two ways a guide can be wrong, and both are measured. */
const COVERAGE = 0.6;
const INSIDE = 0.9;

const { page, finish } = await openApp({ name: 'trace' });
await startScene(page, 'Trace');
await page.waitForTimeout(500);

const state = () =>
  page.evaluate(() => {
    const s = window.__game.scene.getScene('Trace');
    return {
      letter: s.letterId,
      guided: Boolean(s.guide),
      strokes: s.guide?.strokes.length ?? 0,
      index: s.guide?.index ?? -1,
      cursor: s.guide?.cursor ?? 0,
      inside: s.insideCount ?? 0,
      coverage: s.coverage,
      locked: s.locked,
    };
  });

/* Opens a particular letter, whatever order the sequence is in. */
const openLetter = async (id) => {
  await page.evaluate((letterId) => {
    const s = window.__game.scene.getScene('Trace');
    s.index = s.sequence.indexOf(letterId);
    s.buildLetter();
  }, id);
  await page.waitForTimeout(350);
};

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

const toPage = (geo, gx, gy) => [geo.left + gx * geo.scale, geo.top + gy * geo.scale];

step('checking every guide covers the letter it writes');
const coverage = await page.evaluate(([source, paths, ids]) => {
  const measured = [];
  for (const id of ids) {
    const glyph = source.letters[id].isolated;
    const [bx, by, bw, bh] = glyph.bbox;

    // Rasterised at a size where a nib is a comfortable number of pixels, so a pixel count means something.
    const scale = 300 / bh;
    const nib = source.upem * 0.075 * scale;
    const pad = Math.ceil(nib);
    const width = Math.ceil(bw * scale) + pad * 2;
    const height = Math.ceil(bh * scale) + pad * 2;

    const make = () => {
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      ctx.translate(pad - bx * scale, pad - by * scale);
      ctx.scale(scale, scale);
      return ctx;
    };

    const letterCtx = make();
    letterCtx.fillStyle = '#000';
    letterCtx.fill(new Path2D(glyph.d), 'nonzero');

    const strokeCtx = make();
    strokeCtx.strokeStyle = '#000';
    strokeCtx.fillStyle = '#000';
    strokeCtx.lineCap = 'round';
    strokeCtx.lineJoin = 'round';
    strokeCtx.lineWidth = source.upem * 0.075;
    for (const stroke of paths.letters[id].strokes) {
      if (stroke.kind === 'dab') {
        strokeCtx.beginPath();
        strokeCtx.arc(stroke.points[0][0], stroke.points[0][1], source.upem * 0.05, 0, Math.PI * 2);
        strokeCtx.fill();
        continue;
      }
      strokeCtx.beginPath();
      stroke.points.forEach(([x, y], i) => (i ? strokeCtx.lineTo(x, y) : strokeCtx.moveTo(x, y)));
      strokeCtx.stroke();
    }

    const a = letterCtx.getImageData(0, 0, width, height).data;
    const b = strokeCtx.getImageData(0, 0, width, height).data;
    let ink = 0;
    let hit = 0;
    for (let i = 3; i < a.length; i += 4) {
      if (a[i] <= 128) continue;
      ink++;
      if (b[i] > 128) hit++;
    }

    // Is the path *on* the letter?
    let samples = 0;
    let onInk = 0;
    const sampleAt = (x, y) => {
      samples++;
      const px = Math.round(pad + (x - bx) * scale);
      const py = Math.round(pad + (y - by) * scale);
      if (px < 0 || py < 0 || px >= width || py >= height) return;
      if (a[(py * width + px) * 4 + 3] > 128) onInk++;
    };
    for (const stroke of paths.letters[id].strokes) {
      if (stroke.kind === 'dab') {
        sampleAt(stroke.points[0][0], stroke.points[0][1]);
        continue;
      }
      for (let i = 1; i < stroke.points.length; i++) {
        const [ax, ay] = stroke.points[i - 1];
        const [cx, cy] = stroke.points[i];
        const steps = Math.max(1, Math.ceil(Math.hypot(cx - ax, cy - ay) / (source.upem * 0.01)));
        for (let k = 0; k <= steps; k++) {
          sampleAt(ax + ((cx - ax) * k) / steps, ay + ((cy - ay) * k) / steps);
        }
      }
    }

    measured.push({
      id,
      covered: ink ? hit / ink : 0,
      inside: samples ? onInk / samples : 0,
    });
  }
  return measured;
}, [glyphs, strokes, guided]);

if (!coverage.length) fail('no letter has a corrected guide — guided tracing is not reachable');
for (const { id, covered, inside } of coverage) {
  if (covered < COVERAGE) {
    fail(
      `${id}: its strokes pass through only ${(covered * 100).toFixed(0)}% of the letter — ` +
        'the guide does not write the whole shape'
    );
  }
  if (inside < INSIDE) {
    fail(
      `${id}: only ${(inside * 100).toFixed(0)}% of what the guide draws is on the letter — ` +
        'the path wanders off it'
    );
  }
}
step(
  `${coverage.length} guided letter(s), covered/on-letter: ` +
    [...coverage]
      .sort((a, b) => a.covered - b.covered)
      .map((c) => `${c.id} ${(c.covered * 100).toFixed(0)}/${(c.inside * 100).toFixed(0)}`)
      .join(', ')
);

step('checking every letter is playable');
const unplayable = await page.evaluate(() => {
  const scene = window.__game.scene.getScene('Trace');
  const bad = [];
  for (let i = 0; i < scene.sequence.length; i++) {
    scene.index = i;
    scene.buildLetter();
    if (scene.guide) {
      const total = scene.guide.strokes.reduce((sum, s) => sum + (s.length || 0), 0);
      // A dab has no length, so a letter of nothing but dots is legitimate.
      const dabs = scene.guide.strokes.every((s) => s.kind === 'dab');
      if (!scene.guide.strokes.length || (!dabs && total <= 0)) {
        bad.push(`${scene.letterId}(guide is empty)`);
      }
    } else if (scene.insideCount < 20) {
      bad.push(`${scene.letterId}(${scene.insideCount}px to colour)`);
    }
  }
  scene.index = 0;
  scene.buildLetter();
  return bad;
});
for (const bad of unplayable) fail(`nothing to do on ${bad}`);
if (!unplayable.length) step('every letter has either a guide or something to colour');

const guidedId = coverage[0].id;
await openLetter(guidedId);
const opened = await state();
if (!opened.guided) fail(`${guidedId} has a corrected guide but did not open in guided mode`);
if (opened.coverage !== 0) fail(`${guidedId} opened at ${opened.coverage} progress`);

step(`guided: following the line on ${guidedId}`);
const geo = await geometry();
const paths = await page.evaluate(() =>
  window.__game.scene
    .getScene('Trace')
    .guide.strokes.map((s) => ({ kind: s.kind, points: s.points.map((p) => ({ x: p.x, y: p.y })) }))
);

/* Walks one recorded stroke with a real pointer. */
async function follow(stroke, offset = { x: 0, y: 0 }) {
  const at = (p) => toPage(geo, p.x + offset.x, p.y + offset.y);
  if (stroke.kind === 'dab') {
    const [x, y] = at(stroke.points[0]);
    await page.mouse.click(x, y);
    await page.waitForTimeout(160);
    return;
  }
  const [sx, sy] = at(stroke.points[0]);
  await page.mouse.move(sx, sy);
  await page.mouse.down();
  for (const point of stroke.points.slice(1)) {
    const [x, y] = at(point);
    await page.mouse.move(x, y, { steps: 6 });
  }
  await page.mouse.up();
  await page.waitForTimeout(160);
}

step('guided: a line nowhere near the guide');
await follow(paths[0], { x: 200, y: 160 });
const strayed = await state();
if (strayed.coverage > 0) {
  fail(`a stroke 200px off the path advanced the ink to ${(strayed.coverage * 100).toFixed(0)}%`);
} else {
  step('nothing happened, as it must');
}

step('guided: lifting a finger halfway');
const first = paths[0];
if (first.kind === 'drag') {
  const half = Math.max(1, Math.floor(first.points.length / 2));
  await follow({ kind: 'drag', points: first.points.slice(0, half) });
  const lifted = await state();
  if (lifted.coverage <= 0) fail('half a stroke drew nothing');
  else {
    // And carrying on from there finishes it rather than starting over.
    await follow({ kind: 'drag', points: first.points.slice(half - 1) });
    const resumed = await state();
    if (resumed.coverage <= lifted.coverage) {
      fail(`picking the stroke back up did not carry on (${lifted.coverage} -> ${resumed.coverage})`);
    } else {
      step(`kept ${(lifted.coverage * 100).toFixed(0)}% and carried on from there`);
    }
  }
} else {
  await follow(first);
}

for (const stroke of paths.slice(1)) await follow(stroke);
const completed = await page
  .waitForFunction(() => window.__game.scene.getScene('Trace').locked, null, { timeout: 20000 })
  .then(() => true)
  .catch(() => false);
const done = await state();
if (!completed) {
  fail(`following every stroke of ${guidedId} left it unfinished at stroke ${done.index}`);
} else {
  step(`${guidedId} written, ${done.strokes} stroke(s)`);
}

const movedOn = await page
  .waitForFunction((was) => window.__game.scene.getScene('Trace').letterId !== was, guidedId, {
    timeout: 25000,
  })
  .then(() => true)
  .catch(() => false);
if (!movedOn) fail(`finishing ${guidedId} did not move on to the next letter`);

step('serving a glyphs.json baked from a different font, to reach colouring');
await page.route('**/glyphs.json*', async (route) => {
  const response = await route.fetch();
  const sheet = await response.json();
  sheet.font = { file: 'another.woff2', sha: 'deadbeefcafe' };
  await route.fulfill({ response, json: sheet });
});
await page.reload({ waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => window.__game?.scene.isActive('Home'), null, { timeout: 30000 });
await startScene(page, 'Trace');
await page.waitForTimeout(500);

const plainId = await page.evaluate(() => window.__game.scene.getScene('Trace').letterId);
{
  await openLetter(plainId);
  const plain = await state();
  if (plain.guided) fail(`${plainId} has no guide but opened in guided mode`);
  else step(`colouring: ${plainId} falls back, ${plain.inside} cells to fill`);

  const geoPlain = await geometry();
  const sweep = async (fraction) => {
    const y = geoPlain.y + fraction * geoPlain.h;
    const [x0, y0] = toPage(geoPlain, geoPlain.x, y);
    await page.mouse.move(x0, y0);
    await page.mouse.down();
    for (let i = 1; i <= 12; i++) {
      const [xi, yi] = toPage(geoPlain, geoPlain.x + (geoPlain.w * i) / 12, y);
      await page.mouse.move(xi, yi);
    }
    await page.mouse.up();
  };

  await sweep(0.5);
  const swept = await state();
  if (swept.coverage <= 0) fail('a stroke across the letter raised no coverage');
  else step(`one stroke -> ${(swept.coverage * 100).toFixed(0)}% coverage`);

  step('colouring: a scribble outside the letter counts for nothing');
  const outsideBefore = (await state()).coverage;
  const [ox, oy] = toPage(geoPlain, geoPlain.x - 260, geoPlain.y + geoPlain.h / 2);
  await page.mouse.move(ox, oy);
  await page.mouse.down();
  for (let i = 0; i < 10; i++) await page.mouse.move(ox, oy + i * 12);
  await page.mouse.up();
  if ((await state()).coverage !== outsideBefore) fail('scribbling outside changed the coverage');
  else step('outside strokes ignored');

  step('colouring: Start again clears the letter');
  await page.evaluate(() => window.__game.scene.getScene('Trace').reset());
  await page.waitForTimeout(300);
  if ((await state()).coverage !== 0) fail('Start again left coverage behind');
  else step('Start again clears it');

  step('colouring: filling to completion');
  const geoFill = await geometry();
  for (let i = 0; i <= 26; i++) {
    const y = geoFill.y + (i / 26) * geoFill.h;
    const [x0, y0] = toPage(geoFill, geoFill.x, y);
    await page.mouse.move(x0, y0);
    await page.mouse.down();
    for (let k = 1; k <= 12; k++) {
      const [xi, yi] = toPage(geoFill, geoFill.x + (geoFill.w * k) / 12, y);
      await page.mouse.move(xi, yi);
    }
    await page.mouse.up();
    const now = await state();
    if (now.locked || now.letter !== plainId) break;
  }
  const filled = await page
    .waitForFunction((was) => window.__game.scene.getScene('Trace').letterId !== was, plainId, {
      timeout: 25000,
    })
    .then(() => true)
    .catch(() => false);
  if (!filled) fail(`colouring ${plainId} in did not move on`);
  else step(`${plainId} coloured in and moved on`);
}

await page.screenshot({ path: process.argv[3] || 'trace-check.png' });
await finish();
