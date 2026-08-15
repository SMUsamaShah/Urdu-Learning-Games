/**
 * End-to-end check of the tracing studio, driven through the real UI.
 *
 * The studio is now a shell around src/ui/stroke-editor.js, which the app's
 * settings screen also loads. That is the point of the extraction and also its
 * risk: the editor is a thousand lines of DOM that nothing else executes, so a
 * broken selector or a swallowed pointer event is invisible until somebody sits
 * down to correct a letter and finds they cannot.
 *
 * So: launch the real server, open the real page, move a point with the mouse,
 * remove one with a long press, and assert content/strokes.json on disk changed
 * to match. Nothing is stubbed, and the file is restored byte for byte
 * afterwards — a verification run must never leave an edit in the repo.
 *
 * Usage: node tools/verify-trace-studio.mjs [screenshot.png]
 */

import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { CONTENT_DIR, ROOT } from './audio-keys.mjs';
import { fail, openApp, step } from './harness.mjs';

// Distinct from every other verifier's port; they are often run one after
// another and a leftover server makes the next run fail confusingly.
const PORT = 5197;
const SHOT = process.argv[2];
const STROKES_FILE = path.join(CONTENT_DIR, 'strokes.json');

/** A corrected letter with one plain drag stroke, so the assertions are simple. */
const LETTER = 'alif';
/** The point that gets dragged, and the one that gets long-pressed away. */
const DRAGGED = 2;
const REMOVED = 1;

const original = fs.readFileSync(STROKES_FILE);
const before = JSON.parse(original).letters[LETTER];
if (!before?.corrected || before.strokes.length !== 1 || before.strokes[0].points.length < 4) {
  console.log(`Skipping: ${LETTER} is not the single 4-point stroke this check assumes.`);
  process.exit(0);
}

const server = spawn(process.execPath, ['tools/trace-studio/server.mjs'], {
  cwd: ROOT,
  env: { ...process.env, PORT: String(PORT) },
  stdio: ['ignore', 'pipe', 'inherit'],
});

const cleanup = () => {
  server.kill();
  // Byte for byte, not a re-serialised parse: this file is committed, and a
  // verification run that reformats it would show up as a diff nobody made.
  fs.writeFileSync(STROKES_FILE, original);
};
process.on('exit', cleanup);
// 'exit' does not fire on a signal, and a killed run must not leave a moved
// point behind looking like somebody's correction.
for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP']) {
  process.on(signal, () => process.exit(1));
}

step('waiting for server');
await new Promise((resolve) => {
  server.stdout.on('data', (d) => String(d).includes('Tracing studio') && resolve());
  setTimeout(resolve, 4000);
});

const { page, finish } = await openApp({
  name: 'tracing studio',
  timeoutMs: 90000,
  open: false,
  waitForHome: false,
  context: { viewport: { width: 1280, height: 900 }, deviceScaleFactor: 2 },
});

// Leaving a letter with unsaved edits asks first, and Playwright dismisses a
// dialog it is not told about — which reads as the letter picker being broken.
// Accepting is what a person does when they have finished experimenting.
page.on('dialog', (dialog) => dialog.accept());

step('navigating');
await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'domcontentloaded' });
await page.waitForSelector('.ste-board', { timeout: 15000 });

/** The letter's own outline, which is what a correction is aimed at. */
const outline = await page.$eval('.ste-board > path', (el) => el.getAttribute('d')?.length ?? 0);
if (outline < 50) fail('the letter did not render on the board');

const letterCount = await page.$$eval('.ste-letters button', (els) => els.length);
console.log(`editor loaded ${letterCount} letters`);
if (letterCount < 30) fail(`only ${letterCount} letters in the picker`);

step(`opening ${LETTER}`);
await page.$$eval(
  '.ste-letters button',
  (els, id) => els.find((el) => el.textContent === id)?.click(),
  LETTER
);
await page.waitForFunction(
  (id) => document.querySelector('.ste-title')?.textContent.includes(id),
  LETTER,
  { timeout: 5000 }
);

const strokeRows = await page.$$eval('.ste-strokes li', (els) => els.length);
if (strokeRows !== 1) fail(`${LETTER} shows ${strokeRows} strokes, expected 1`);

/**
 * Where a point's grab target is on screen.
 *
 * The centre of the visible ring. What can actually be grabbed is a good deal
 * wider than that — proximity in font units rather than a hit test, see GRAB in
 * the editor — but the ring is what a person aims at, so it is what this aims
 * at too.
 */
const targetAt = async (index) => {
  const box = await page.locator(`.ste-handle[data-point="${index}"]`).boundingBox();
  if (!box) throw new Error(`no grab target for point ${index}`);
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
};

const handles = await page.$$eval('.ste-handle', (els) => els.length);
if (handles !== before.strokes[0].points.length) {
  fail(`${handles} grab targets for ${before.strokes[0].points.length} points`);
}

step('dragging a point');
const from = await targetAt(DRAGGED);
await page.mouse.move(from.x, from.y);
await page.mouse.down();
// In steps, so the pointermove listener actually fires: a single jump can be
// delivered as one event that arrives before capture is set up.
for (let i = 1; i <= 6; i++) {
  await page.mouse.move(from.x + (44 * i) / 6, from.y + (30 * i) / 6);
}
await page.mouse.up();

if (SHOT) await page.screenshot({ path: SHOT });

step('saving');
await page.click('[data-act="save"]');
await page.waitForFunction(
  (id) => document.querySelector('.ste-status')?.textContent === `Saved ${id}`,
  LETTER,
  { timeout: 8000 }
);

const dragged = JSON.parse(fs.readFileSync(STROKES_FILE, 'utf8')).letters[LETTER];
const moved = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
const shift = moved(dragged.strokes[0].points[DRAGGED], before.strokes[0].points[DRAGGED]);
console.log(`point ${DRAGGED} moved ${shift.toFixed(0)} font units`);
if (shift < 20) fail('the drag did not reach content/strokes.json');
for (const i of [0, 3]) {
  if (moved(dragged.strokes[0].points[i], before.strokes[0].points[i]) > 0.5) {
    fail(`dragging point ${DRAGGED} also moved point ${i}`);
  }
}
if (!dragged.corrected) fail('the saved letter is not marked corrected');

step('removing a point with a long press');
const hold = await targetAt(REMOVED);
await page.mouse.move(hold.x, hold.y);
await page.mouse.down();
// Longer than LONG_PRESS in the editor, and with no movement in between —
// movement is what tells it this is a drag instead.
await page.waitForTimeout(900);
await page.mouse.up();
await page.waitForFunction(
  (want) => document.querySelectorAll('.ste-handle').length === want,
  before.strokes[0].points.length - 1,
  { timeout: 5000 }
);

await page.click('[data-act="save"]');
await page.waitForFunction(
  () => document.querySelector('.ste-status')?.textContent.startsWith('Saved'),
  null,
  { timeout: 8000 }
);
const pruned = JSON.parse(fs.readFileSync(STROKES_FILE, 'utf8')).letters[LETTER];
console.log(`points after the long press: ${pruned.strokes[0].points.length}`);
if (pruned.strokes[0].points.length !== before.strokes[0].points.length - 1) {
  fail('the long press did not remove a point');
}

// --- tracing a letter from its own outline ----------------------------------
//
// The thing that produced every path in the app, now reachable from the editor
// instead of only from a command line. Its knobs are what make it worth
// exposing: a letter it gets wrong is usually one number away from right.

step('tracing a letter from its outline');
await page.$$eval('.ste-letters button', (els) => els.find((el) => el.textContent === 'khe')?.click());
await page.waitForFunction(
  () => document.querySelector('.ste-title')?.textContent.includes('khe'),
  null,
  { timeout: 5000 }
);
await page.click('.ste-seed > summary');
const knobs = await page.$$eval('.ste-knob input', (els) =>
  els.map((el) => `${el.dataset.knob}=${el.value}`)
);
step(`  knobs: ${knobs.join(' ')}`);
if (knobs.length !== 4) fail(`${knobs.length} knobs, expected 4`);
if (!knobs.includes('rasterHeight=320')) {
  fail(`the knobs do not start at what the shipped paths were seeded with: ${knobs.join()}`);
}

const shapeNow = () => page.$$eval('.ste-strokes li .ste-grow', (els) => els.map((e) => e.textContent));
const seeded = await shapeNow();
await page.click('[data-act="reseed"]');
await page.waitForTimeout(400);
const traced = await shapeNow();
step(`  ${seeded.length} stroke(s) -> ${traced.length}`);
// The letter's committed path came from this same code at these same numbers,
// so tracing it again has to reproduce it. If it does not, the extraction from
// the seeder changed the geometry.
if (traced.join() !== seeded.join()) {
  fail(`tracing at the seeded numbers gave ${traced.join(' | ')}, not ${seeded.join(' | ')}`);
} else {
  step('  at the seeded numbers it reproduces the committed path exactly');
}

// And the knobs have to do something, or they are decoration.
step('  turning the smoothing up');
await page.$eval('.ste-knob input[data-knob="simplify"]', (el) => {
  el.value = '6';
  el.dispatchEvent(new Event('input', { bubbles: true }));
});
await page.waitForTimeout(400);
const smoothed = await shapeNow();
step(`  ${traced.join(' | ')} -> ${smoothed.join(' | ')}`);
if (smoothed.join() === traced.join()) fail('the smoothing knob changed nothing');

// One undo for the whole session of dragging, not one per slider frame.
await page.click('[data-act="undo"]');
await page.waitForTimeout(250);
const undone = await shapeNow();
if (undone.join() !== seeded.join()) {
  fail(`undo after tracing gave ${undone.join(' | ')}, not the ${seeded.join(' | ')} before`);
} else {
  step('  and one undo puts back what was there before any of it');
}

// --- copying another letter's strokes ---------------------------------------
//
// ج چ ح خ are one shape with a different number of dots, and so are eight other
// families. Drawing the skeleton twice by hand gives two skeletons that differ
// slightly, which is worse than either.

step('copying a sibling’s strokes');
await page.$$eval('.ste-letters button', (els) => els.find((el) => el.textContent === 'che')?.click());
await page.waitForFunction(
  () => document.querySelector('.ste-title')?.textContent.includes('che'),
  null,
  { timeout: 5000 }
);
const beforeCopy = await page.$$eval('.ste-strokes li', (els) => els.length);

// The family goes first in the list, so this is what somebody would reach for.
const offered = await page.$$eval('.ste-copy-pick optgroup', (groups) =>
  groups.map((g) => `${g.label}: ${[...g.children].map((o) => o.value).join(' ')}`)
);
step(`  offered — ${offered.join(' | ')}`);
if (!offered[0]?.startsWith('Same family')) fail('the shape family is not offered first');
if (!offered[0].includes('jim')) fail(`che was not offered jim to copy from: ${offered[0]}`);

await page.selectOption('.ste-copy-pick', 'jim');
await page.waitForTimeout(300);
const afterCopy = await page.$$eval('.ste-strokes li', (els) => els.length);
const jim = JSON.parse(fs.readFileSync(STROKES_FILE, 'utf8')).letters.jim.strokes;
step(`  ${beforeCopy} stroke(s) -> ${afterCopy}, jim has ${jim.length}`);
if (afterCopy !== jim.length) fail(`copying from jim left ${afterCopy} strokes, not ${jim.length}`);

const landed = await page.$eval('.ste-board polyline', (el) =>
  el.getAttribute('points').split(' ')[0]
);
if (landed !== jim[0].points[0].join(',')) {
  fail(`the copied path starts at ${landed}, jim's starts at ${jim[0].points[0]}`);
} else {
  step('  the points arrived verbatim, so the path sits where the shared shape is');
}

// It is an edit like any other, which matters: copying the wrong letter is the
// easiest mistake this control makes possible.
await page.click('[data-act="undo"]');
await page.waitForTimeout(200);
const afterUndo = await page.$$eval('.ste-strokes li', (els) => els.length);
if (afterUndo !== beforeCopy) fail(`undo left ${afterUndo} strokes, not the ${beforeCopy} before`);
else step('  and undo puts back what was there');

// --- importing a tablet export ---------------------------------------------
//
// The far end of the loop: fix a letter on the sofa, export, send it over,
// merge it here. The refusal matters more than the merge — an import writes
// into the repo, where a path drawn for the wrong font looks exactly like a
// good one and outlives the mistake.

const glyphs = JSON.parse(fs.readFileSync(path.join(CONTENT_DIR, 'glyphs.json'), 'utf8'));
const exported = {
  kind: 'urdu-traces',
  version: 1,
  upem: glyphs.upem,
  font: glyphs.font,
  letters: {
    [LETTER]: {
      strokes: [{ kind: 'drag', points: before.strokes[0].points.map(([x, y]) => [x + 3, y]) }],
      corrected: true,
    },
  },
};

const post = async (payload) => {
  const response = await fetch(`http://localhost:${PORT}/api/import`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  });
  return { status: response.status, body: await response.json() };
};

step('importing an export drawn for the current font');
const good = await post(exported);
if (good.status !== 200) fail(`a matching export was refused: ${good.body.error}`);
else console.log(`merged ${good.body.merged.join(', ')}`);

const imported = JSON.parse(fs.readFileSync(STROKES_FILE, 'utf8')).letters[LETTER];
if (imported.strokes[0].points.length !== before.strokes[0].points.length) {
  fail('the imported letter is not the one that was sent');
}
if (Math.abs(imported.strokes[0].points[0][0] - before.strokes[0].points[0][0] - 3) > 0.01) {
  fail('the import did not replace the letter in content/strokes.json');
}

// The same thing through the button somebody actually presses. The endpoint
// working and the file picker being wired to it are two different claims.
step('importing through the file picker');
const dropped = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'traces-')), 'urdu-traces.json');
fs.writeFileSync(dropped, JSON.stringify(exported));
await page.setInputFiles('#import-file', dropped);
await page.waitForFunction(
  () => document.getElementById('count')?.textContent.startsWith('Imported'),
  null,
  { timeout: 8000 }
);
// It reloads to show the merged paths, and the editor has to come back up.
await page.waitForSelector('.ste-board', { timeout: 15000 });

step('importing one drawn for a different font');
const stale = await post({ ...exported, font: { file: 'another.woff2', sha: 'deadbeefcafe' } });
if (stale.status !== 409) fail(`a stale export was answered with ${stale.status}, not a refusal`);
else console.log(`refused: ${stale.body.error}`);

// And refused *whole*: a half-merge would leave the repo carrying paths from
// two different fonts with nothing to say which is which.
const afterStale = JSON.parse(fs.readFileSync(STROKES_FILE, 'utf8')).letters[LETTER];
if (JSON.stringify(afterStale) !== JSON.stringify(imported)) {
  fail('the refused import changed content/strokes.json anyway');
}

// Playback is the only honest way to check a stroke order, so it has to run.
step('playing it back');
await page.click('[data-act="play"]');
await page.waitForFunction(
  () => {
    const trail = document.querySelector('.ste-board path:last-of-type');
    return (trail?.getAttribute('d')?.length ?? 0) > 20;
  },
  null,
  { timeout: 8000 }
);

step('closing');
await finish();
