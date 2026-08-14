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

const { page, finish, url } = await openApp({
  name: 'traces',
  waitForHome: false,
  open: false,
  context: { acceptDownloads: true },
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
const box = await page.locator('.ste-hit[data-point="2"]').boundingBox();
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

await finish();
