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
 * Through the invisible `.ste-hit` circle rather than the visible ring, because
 * the hit circle is what the person's finger actually lands on and it is new
 * code. If these ever come apart, the handles look fine and nothing moves.
 */
const targetAt = async (index) => {
  const box = await page.locator(`.ste-hit[data-point="${index}"]`).boundingBox();
  if (!box) throw new Error(`no grab target for point ${index}`);
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
};

const handles = await page.$$eval('.ste-hit', (els) => els.length);
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
  (want) => document.querySelectorAll('.ste-hit').length === want,
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
