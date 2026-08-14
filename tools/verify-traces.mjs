/**
 * Fixing a letter's pen path on the device, and having it reach the game.
 *
 * The whole point of the Settings editor is that a correction made on a tablet
 * is playable on that tablet immediately and can then be sent to me as a file.
 * Every link in that is invisible from anywhere else: the paths live in
 * IndexedDB, the game reads them through a cache filled at startup, and the
 * export is a Blob that never touches a server.
 *
 * So this drives the real thing end to end:
 *
 *   parental gate → Settings → Letter traces → drag a point → Save
 *     → the Write screen guides along the *edited* path, not the bundled one
 *     → Export writes a file with the font fingerprint in it
 *     → poisoning that fingerprint turns every letter back to colouring in
 *
 * The last one is the case that matters most and the one nobody will be looking
 * for: it only ever happens months from now, when the font changes.
 *
 * Usage: npm run dev &  then  node tools/verify-traces.mjs [baseUrl]
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fail, homeIsUp, openApp, step } from './harness.mjs';

/** A letter with a bundled guide, so "device beats bundled" is a real contest. */
const LETTER = 'alif';

const { context, page, finish, url } = await openApp({
  name: 'traces',
  waitForHome: false,
  open: false,
  // hasTouch for the second half: the editor's gestures are the thing being
  // checked, and a context without touch cannot produce them.
  context: { acceptDownloads: true, hasTouch: true },
});

const openHome = async () => {
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await homeIsUp(page);
};

/** Through the gate and into Settings. The same route a parent takes. */
async function openSettings() {
  await page.evaluate(() => {
    window.__game.scene.getScene('Home').settingsButton.emit('pointerdown');
  });
  await page.waitForSelector('.gate', { timeout: 10000 });
  const question = await page.textContent('#gate-q');
  const [, a, b] = question.match(/What is (\d+) × (\d+)\?/) ?? [];
  if (!a) fail(`could not read the gate question: "${question}"`);
  await page.fill('.gate-input', String(Number(a) * Number(b)));
  await page.click('.gate-ok');
  await page.waitForSelector('.set-root', { timeout: 10000 });
}

await openHome();
step('opening settings');
await openSettings();

// --- 1. The page is reachable and says how many letters are guided ----------

const rowValue = await page.textContent('.set-root [data-page="traces"] .set-row-value');
step(`the Writing row reads "${rowValue}"`);
if (!/^\d+ of \d+$/.test(rowValue ?? '')) {
  fail(`the Letter traces row reads "${rowValue}", which is not a count`);
}

step('opening the traces page');
await page.click('.set-root [data-page="traces"]');
await page.waitForSelector('.ste-board', { timeout: 20000 });

// The editor is loaded on demand, so its stylesheet arrives with it. A page
// whose CSS never loaded still "works" — every element is there and every
// handler fires — and is unusable, which is why this is measured rather than
// eyeballed.
const boardHeight = await page.$eval('.ste-board', (el) => el.getBoundingClientRect().height);
if (boardHeight < 150) {
  fail(`the board is ${boardHeight.toFixed(0)}px tall — the editor's stylesheet did not load`);
} else {
  step(`board is ${boardHeight.toFixed(0)}px tall, so its styles arrived with it`);
}

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

const where = await page.textContent('.set-traces-where');
if (where !== 'From the app') fail(`${LETTER} says "${where}" before it has been edited`);

// --- 2. An edit is saved to the device --------------------------------------

/** The path as the app will draw it, in font units. */
const pathNow = () =>
  page.evaluate(
    (id) => window.__strokes.editableStrokes()[id].strokes[0].points.map((p) => [...p]),
    LETTER
  );

const before = await pathNow();

step('dragging a point and saving');
const box = await page.locator('.ste-handle[data-point="2"]').boundingBox();
await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
await page.mouse.down();
for (let i = 1; i <= 6; i++) {
  await page.mouse.move(box.x + box.width / 2 + 7 * i, box.y + box.height / 2 + 5 * i);
}
await page.mouse.up();
await page.click('.ste-controls [data-act="save"]');
await page.waitForFunction(
  (id) => document.querySelector('.ste-status')?.textContent === `Saved ${id}`,
  LETTER,
  { timeout: 8000 }
);

const editedWhere = await page.textContent('.set-traces-where');
if (editedWhere !== 'Edited on this device') {
  fail(`after saving, ${LETTER} still says "${editedWhere}"`);
}

const after = await pathNow();
const moved = Math.hypot(after[2][0] - before[2][0], after[2][1] - before[2][1]);
step(`point 2 moved ${moved.toFixed(0)} font units`);
if (moved < 20) fail('the drag did not reach the app');

// The count on the row behind should have picked up the edit too — it is read
// from the same place the game reads.
await page.click('.set-back');
await page.waitForSelector('.set-list', { timeout: 5000 });

// --- 3. The edit survives a reload and reaches the Write screen -------------
//
// This is the device tier doing its job, and it is invisible from anywhere
// else: the bundled path for this letter is still in the bundle, unchanged.

step('reloading, then opening the Write screen');
await openHome();
const inGame = await page.evaluate((id) => {
  const s = window.__strokes;
  return {
    source: s.strokeSource(id),
    points: s.editableStrokes()[id].strokes[0].points.map((p) => [...p]),
  };
}, LETTER);

if (inGame.source !== 'device') {
  fail(`after a reload the game reads ${LETTER} from "${inGame.source}", not the device`);
}
const survived = Math.hypot(inGame.points[2][0] - after[2][0], inGame.points[2][1] - after[2][1]);
if (survived > 0.5) fail('the reloaded path is not the one that was saved');
else step('the saved path came back from IndexedDB unchanged');

// And the guide the game actually draws is built from it.
await page.evaluate((id) => {
  const game = window.__game;
  game.scene.getScenes(true).forEach((s) => game.scene.stop(s.scene.key));
  game.scene.start('Trace');
}, LETTER);
await page.waitForFunction(() => window.__game?.scene.isActive('Trace'), null, { timeout: 20000 });
await page.evaluate((id) => {
  const s = window.__game.scene.getScene('Trace');
  s.index = s.sequence.indexOf(id);
  s.buildLetter();
}, LETTER);
await page.waitForTimeout(350);

const drawn = await page.evaluate(() => {
  const s = window.__game.scene.getScene('Trace');
  return { guided: Boolean(s.guide), strokes: s.guide?.strokes.length ?? 0 };
});
if (!drawn.guided) fail(`${LETTER} opened in colouring mode despite having a device guide`);
else step(`${LETTER} opened guided, ${drawn.strokes} stroke(s), from the device's path`);

// --- 4. Export writes a file with the fingerprint in it ---------------------

step('exporting');
// Back to the menu first: the Write screen is what is running, and the
// grown-ups button belongs to Home.
await openHome();
await openSettings();
await page.click('.set-root [data-page="traces"]');
await page.waitForSelector('.ste-board', { timeout: 20000 });

const [download] = await Promise.all([
  page.waitForEvent('download', { timeout: 20000 }),
  page.click('[data-act="export"]'),
]);
const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'traces-')), download.suggestedFilename());
await download.saveAs(file);
const exported = JSON.parse(fs.readFileSync(file, 'utf8'));
step(`${download.suggestedFilename()}: ${Object.keys(exported.letters).length} letter(s)`);

if (!/^urdu-traces-\d{4}-\d{2}-\d{2}\.json$/.test(download.suggestedFilename())) {
  fail(`exported as "${download.suggestedFilename()}"`);
}
// Without the fingerprint the file cannot be refused by the studio, which is
// the only thing standing between a font change and silently wrong guides in
// the repo.
if (!exported.font?.sha) fail('the export carries no font fingerprint');
if (!exported.letters[LETTER]?.corrected) fail(`the export does not contain ${LETTER}`);
if (Object.keys(exported.letters).length !== 1) {
  fail('the export contains letters that were not edited on this device');
}

// --- 5. A stale fingerprint turns every guide off --------------------------

step('poisoning the stored fingerprint');
await page.evaluate(
  () =>
    new Promise((resolve, reject) => {
      const open = indexedDB.open('urdu-learning-games');
      open.onsuccess = () => {
        const db = open.result;
        const tx = db.transaction('meta', 'readwrite');
        const store = tx.objectStore('meta');
        const get = store.get('strokes');
        get.onsuccess = () => {
          const stored = get.result;
          stored.font = { file: 'somethingelse.woff2', sha: 'deadbeefcafe' };
          store.put(stored, 'strokes');
        };
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      };
      open.onerror = () => reject(open.error);
    })
);

await openHome();
const afterPoison = await page.evaluate((id) => window.__strokes.strokeSource(id), LETTER);
if (afterPoison === 'device') {
  fail('a device path drawn for another font is still being used as a guide');
} else {
  step(`${LETTER} fell back to "${afterPoison}" — the stale device path was dropped`);
}

// --- 6. A font change turns the whole feature off --------------------------
//
// Done by rewriting the fingerprint in glyphs.json on the way to the browser,
// which is exactly what re-baking against another typeface produces. No
// back door in the app: this is the real mechanism, and the app cannot tell the
// difference.

step('serving a glyphs.json baked from a different font');
await page.route('**/glyphs.json*', async (route) => {
  const response = await route.fetch();
  const sheet = await response.json();
  sheet.font = { file: 'another.woff2', sha: 'deadbeefcafe' };
  await route.fulfill({ response, json: sheet });
});

await openHome();
const allOff = await page.evaluate(() => window.__strokes.guidedLetters().length);
if (allOff !== 0) fail(`${allOff} letter(s) are still guided after a font change`);
else step('no letter claims a guide any more');

// And the screen a child actually opens agrees, which is the only claim that
// matters: paths drawn for another face sit beside the letter, and following
// one teaches the wrong shape.
await page.evaluate(() => {
  const game = window.__game;
  game.scene.getScenes(true).forEach((s) => game.scene.stop(s.scene.key));
  game.scene.start('Trace');
});
await page.waitForFunction(() => window.__game?.scene.isActive('Trace'), null, { timeout: 20000 });
await page.evaluate((id) => {
  const s = window.__game.scene.getScene('Trace');
  s.index = s.sequence.indexOf(id);
  s.buildLetter();
}, LETTER);
await page.waitForTimeout(350);

const stale = await page.evaluate(() => {
  const s = window.__game.scene.getScene('Trace');
  return { guided: Boolean(s.guide), colouring: Boolean(s.cover) };
});
if (stale.guided) fail(`${LETTER} is still guided by a path drawn for another font`);
else if (!stale.colouring) fail(`${LETTER} has no guide and nothing to colour in either`);
else step(`${LETTER} opened as colouring in, which needs no authoring and cannot go stale`);

// --- 7. The same editor, with a finger ------------------------------------
//
// Everything above drives the editor with a mouse, and every one of those
// checks passed while the editor was close to unusable on a phone — which is
// the device it was built for. Mouse and touch are different input paths, and
// only one of them was ever exercised.
//
// So: a second pass in a touch context, using real browser-level touch input
// through CDP rather than synthesised events. Playwright's touchscreen can tap
// and nothing else, and a tap is not the gesture that was broken.

step('--- the same page, driven by a finger');
const phone = await context.newPage();
await phone.setViewportSize({ width: 412, height: 890 });
const cdp = await context.newCDPSession(phone);

const finger = {
  async send(type, x, y) {
    await cdp.send('Input.dispatchTouchEvent', {
      type,
      touchPoints: type === 'touchEnd' ? [] : [{ x, y, radiusX: 20, radiusY: 20, force: 1 }],
    });
  },
  async tap(at) {
    await this.send('touchStart', at.x, at.y);
    await phone.waitForTimeout(60);
    await this.send('touchEnd', at.x, at.y);
    await phone.waitForTimeout(150);
  },
  async drag(from, to, steps = 8) {
    await this.send('touchStart', from.x, from.y);
    for (let i = 1; i <= steps; i++) {
      await phone.waitForTimeout(16);
      await this.send(
        'touchMove',
        from.x + ((to.x - from.x) * i) / steps,
        from.y + ((to.y - from.y) * i) / steps
      );
    }
    await this.send('touchEnd', to.x, to.y);
    await phone.waitForTimeout(200);
  },
  /** Held still, which for a real finger means wobbling by a pixel. */
  async hold(at, ms) {
    await this.send('touchStart', at.x, at.y);
    const until = Date.now() + ms;
    while (Date.now() < until) {
      await phone.waitForTimeout(40);
      await this.send('touchMove', at.x + (Math.random() - 0.5) * 2, at.y + (Math.random() - 0.5) * 2);
    }
    await this.send('touchEnd', at.x, at.y);
    await phone.waitForTimeout(200);
  },
};

// The poisoned device record from the checks above is still in IndexedDB, and
// is left there deliberately: it is dropped on read, so this page sees the
// bundled paths, which is what the letter below is edited from. Deleting the
// database instead would block on the page above still holding it open, and the
// app would wait on that open forever rather than reaching the menu.
await phone.goto(url, { waitUntil: 'domcontentloaded' });
await homeIsUp(phone);
await phone.evaluate(() => {
  window.__game.scene.getScene('Home').settingsButton.emit('pointerdown');
});
await phone.waitForSelector('.gate', { timeout: 10000 });
const sum = await phone.textContent('#gate-q');
const [, x, y] = sum.match(/What is (\d+) × (\d+)\?/) ?? [];
await phone.fill('.gate-input', String(Number(x) * Number(y)));
await phone.click('.gate-ok');
await phone.waitForSelector('.set-root', { timeout: 10000 });
await phone.click('[data-page="traces"]');
await phone.waitForSelector('.ste-board', { timeout: 20000 });

// A letter with three separate strokes, so "select another stroke" is a real
// thing to do rather than a no-op.
const TOUCH_LETTER = 'Te';
await phone.$$eval(
  '.ste-letters button',
  (els, id) => els.find((el) => el.textContent === id)?.click(),
  TOUCH_LETTER
);
await phone.waitForFunction(
  (id) => document.querySelector('.ste-title')?.textContent.includes(id),
  TOUCH_LETTER,
  { timeout: 5000 }
);

const shape = () => phone.$$eval('.ste-strokes li .ste-grow', (els) => els.map((e) => e.textContent));

/** The selected stroke as drawn, in font units: `[[x, y], …]`. */
const points = () =>
  phone.$eval('.ste-board polyline', (el) =>
    el
      .getAttribute('points')
      .split(' ')
      .map((pair) => pair.split(',').map(Number))
  );

/**
 * Where on the screen a point of the selected stroke is.
 *
 * Through the visible handle, which is all there is now — the invisible hit
 * circles are gone, because hit-testing is what made this unusable.
 */
async function handleAt(i) {
  const handle = phone.locator(`.ste-handle[data-point="${i}"]`);
  await handle.scrollIntoViewIfNeeded();
  const box = await handle.boundingBox();
  if (!box) throw new Error(`no handle for point ${i}`);
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

const scrollTop = () => phone.$eval('.set-body', (el) => el.scrollTop);

// 7a. A finger drag moves a point. This is the case that was reported, and it
// is the one every mouse-driven check above sailed past.
//
// Grabbed from *beside* the point rather than dead centre on it. A mouse lands
// where it is pointed and a finger does not, and a check that taps the exact
// centre of the ring passes however small the target is — which is the whole
// thing that was wrong. Offset perpendicular to the stroke so the nearest point
// is still the one being aimed at.
step('finger: dragging a point');
const beforeDrag = await points();
const restedAt = await scrollTop();
const [near1, at2, near3] = [await handleAt(1), await handleAt(2), await handleAt(3)];
const along = Math.hypot(near3.x - near1.x, near3.y - near1.y) || 1;
const OFF_CENTRE = 20;
const grabbed = {
  x: at2.x - ((near3.y - near1.y) / along) * OFF_CENTRE,
  y: at2.y + ((near3.x - near1.x) / along) * OFF_CENTRE,
};
step(`  grabbing ${OFF_CENTRE}px off the middle of the ring`);
await finger.drag(grabbed, { x: grabbed.x + 34, y: grabbed.y + 52 });
const afterDrag = await points();
const apart = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
const shifted = apart(afterDrag[2], beforeDrag[2]);
step(`  point 2 moved ${shifted.toFixed(0)} font units`);
if (shifted < 20) fail('a finger cannot move a point');
if (afterDrag.length !== beforeDrag.length) fail('the drag changed how many points there are');
// The neighbours staying put is the difference between dragging a point and
// dragging the whole stroke.
for (const i of [0, 3]) {
  if (apart(afterDrag[i], beforeDrag[i]) > 0.5) fail(`the drag also moved point ${i}`);
}

// 7b. And the page stayed put while it happened — a drag that scrolls the page
// instead is the other way this fails.
//
// Worth being straight about what this proves: Chromium honours `touch-action`
// on the `<svg>` itself, so removing it from the wrapper does not make this
// fail here. The wrapper is there for WebKit, which historically ignores it on
// SVG, and no WebKit is installed to check against. This catches the case where
// it goes missing from both.
if ((await scrollTop()) !== restedAt) {
  fail(`the page scrolled ${(await scrollTop()) - restedAt}px during the drag`);
} else {
  step('  the page did not scroll under the finger');
}

// 7c. Undo puts it back.
step('finger: undo');
await phone.click('[data-act="undo"]');
await phone.waitForTimeout(150);
const undone = await points();
if (apart(undone[2], beforeDrag[2]) > 0.5) {
  fail(`undo left point 2 at ${undone[2]}, not back at ${beforeDrag[2]}`);
} else {
  step('  the point went back where it was');
}

// 7d. A tap on another stroke selects it and changes nothing. This used to
// select *and* insert a point in one gesture, so the first tap on the stroke
// you wanted to fix damaged it — the reported "I have to delete the stroke and
// redo it".
step('finger: tapping another stroke');
const beforeTap = await shape();
const other = await phone.$eval('polyline[data-line="2"]', (el) => {
  // The middle *point* of the line, not the middle of its bounding box, which
  // for a curve is usually not on the line at all.
  const list = el.getAttribute('points').split(' ');
  const [px, py] = list[Math.floor(list.length / 2)].split(',').map(Number);
  const ctm = el.getScreenCTM();
  const at = new DOMPoint(px, py).matrixTransform(ctm);
  return { x: at.x, y: at.y };
});
await finger.tap(other);
const selectedNow = await phone.$$eval('.ste-strokes li', (els) =>
  els.findIndex((el) => el.dataset.selected === 'true')
);
const afterTap = await shape();
if (selectedNow !== 2) fail(`tapping stroke 3 selected stroke ${selectedNow + 1}`);
else if (afterTap.join() !== beforeTap.join()) {
  fail(`the tap that selected a stroke also changed it: ${beforeTap.join(' | ')} -> ${afterTap.join(' | ')}`);
} else {
  step('  it selected the stroke and left it alone');
}

// 7e. Press and hold removes a point, with a finger that never holds quite
// still. Any movement at all used to cancel it, which meant the only way to
// remove a point on a phone did not work on a phone.
step('finger: pressing and holding a point');
const held = await handleAt(1);
await finger.hold(held, 900);
const pruned = await shape();
step(`  ${beforeTap[2]} -> ${pruned[2]}`);
if (pruned[2] === beforeTap[2]) fail('press and hold did not remove a point');

await phone.close();
await finish();
