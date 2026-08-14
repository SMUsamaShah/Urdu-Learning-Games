/**
 * Which way up the app holds itself, and that it never blocks the view to do it.
 *
 * The games are drawn at 1280×720, so the app asks to be held sideways the way
 * a mobile web game does — the lock outright where it is granted, and
 * fullscreen-then-lock in a browser tab, which is the only way a tab is allowed
 * to turn a phone.
 *
 * The claim that matters most is the negative one. There used to be a card here
 * saying "turn your phone", and in a browser tab it covered the whole app: held
 * upright, or with rotation switched off, you saw the card and nothing else.
 * A preference that goes unmet is a much smaller problem than an app you cannot
 * see, so the first checks below are that the app is *there*.
 *
 * The Screen Orientation API is faked in both directions, because a headless
 * browser cannot be rotated and the interesting behaviour is what the app does
 * with what the API tells it.
 *
 * Usage: npm run dev &  then  node tools/verify-orientation.mjs [baseUrl]
 */

import fs from 'node:fs';
import path from 'node:path';
import { fail, homeIsUp, openApp, step } from './harness.mjs';
import { ROOT } from './audio-keys.mjs';

const PORTRAIT = { width: 412, height: 890 };

// --- the manifest must not do the locking ----------------------------------
//
// A manifest lock is absolute: it cannot be released for one screen, which is
// why the locking moved into JavaScript. If it comes back, everything below
// still passes and the phone still will not turn for tracing.

const config = fs.readFileSync(path.join(ROOT, 'vite.config.js'), 'utf8');
const declared = config.match(/orientation: '([a-z-]+)'/)?.[1];
step(`the manifest asks for orientation: ${declared}`);
if (declared !== 'any') {
  fail(`the manifest pins orientation to "${declared}", so no screen can ever turn`);
}

const { browser, finish, url } = await openApp({
  name: 'orientation',
  open: false,
  waitForHome: false,
  context: { viewport: PORTRAIT, hasTouch: true },
});

/**
 * A page whose orientation and fullscreen APIs are whatever we say they are.
 *
 * `lock: false` is a browser tab refusing outside fullscreen. Calls are
 * recorded, so a check can assert what the app *asked for* rather than only
 * what it was given.
 */
async function pageWith({ lock, fullscreen = true, touch = true }) {
  const context = await browser.newContext({ viewport: PORTRAIT, hasTouch: touch });
  const page = await context.newPage();
  await page.addInitScript(
    ([grantsLock, grantsFullscreen]) => {
      window.__calls = [];
      Object.defineProperty(window.screen, 'orientation', {
        configurable: true,
        value: {
          type: 'portrait-primary',
          angle: 0,
          addEventListener() {},
          removeEventListener() {},
          unlock() {
            window.__calls.push('unlock');
          },
          lock(which) {
            window.__calls.push(`lock:${which}`);
            // A tab is allowed the lock only once it is fullscreen, which is
            // the whole reason the app asks for fullscreen at all.
            return grantsLock || document.fullscreenElement
              ? Promise.resolve()
              : Promise.reject(new Error('not allowed'));
          },
        },
      });
      // On the prototype, not on document.documentElement: an init script runs
      // before the document exists, so reaching for documentElement here throws
      // and silently loses half the fake.
      Element.prototype.requestFullscreen = function requestFullscreen() {
        window.__calls.push('fullscreen');
        if (!grantsFullscreen) return Promise.reject(new Error('denied'));
        Object.defineProperty(document, 'fullscreenElement', {
          configurable: true,
          value: this,
        });
        return Promise.resolve();
      };
    },
    [lock, fullscreen]
  );
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await homeIsUp(page);
  return { context, page };
}

const calls = (page) => page.evaluate(() => window.__calls.slice());

/**
 * Anything covering the app.
 *
 * Deliberately not looking for a class name — the point is that *nothing*
 * covers the canvas, not that one particular element does not. Measures what is
 * actually painted at the middle of the screen and asks whether it is the game.
 */
const blockedBy = (page) =>
  page.evaluate(() => {
    const at = document.elementFromPoint(window.innerWidth / 2, window.innerHeight / 2);
    if (!at || at.tagName === 'CANVAS') return null;
    const box = at.getBoundingClientRect();
    const covers = box.width >= window.innerWidth * 0.9 && box.height >= window.innerHeight * 0.9;
    return covers ? `${at.tagName}.${at.className}` : null;
  });

// --- 1. Upright and refused: the app is still there -------------------------
//
// The reported bug, and the first thing checked. Rotation switched off, or a
// browser that will not fullscreen, must still leave a usable app.

step('upright, with nothing granted at all');
const { context: deniedCtx, page: denied } = await pageWith({ lock: false, fullscreen: false });

const covering = await blockedBy(denied);
if (covering) fail(`the app is covered by ${covering} instead of being shown`);
else step('  nothing is covering the app');

const canvas = await denied.evaluate(() => {
  const el = document.querySelector('canvas');
  const box = el?.getBoundingClientRect();
  return box ? { w: Math.round(box.width), h: Math.round(box.height) } : null;
});
if (!canvas || canvas.w < 200 || canvas.h < 100) {
  fail(`the game canvas is ${JSON.stringify(canvas)} — too small to be usable`);
} else {
  step(`  the game is drawn at ${canvas.w}x${canvas.h}, letterboxed into the window`);
}

// Visible is not the same as working, and the difference is a tap.
step('  tapping a game tile');
await denied.evaluate(() => {
  window.__game.scene.getScene('Home').input.enabled = true;
});
const opened = await denied
  .evaluate(async () => {
    const home = window.__game.scene.getScene('Home');
    const tile = home.children.list.find((c) => c.name?.startsWith?.('tile:'));
    if (tile) tile.emit('pointerdown');
    else window.__game.scene.start('Flashcards');
    await new Promise((r) => setTimeout(r, 1200));
    return window.__game.scene.getScenes(true).map((s) => s.scene.key);
  })
  .catch(() => []);
if (!opened.some((key) => key !== 'Home')) {
  fail(`tapping did not open a game (running: ${opened.join() || 'nothing'})`);
} else {
  step(`  it opened ${opened.filter((k) => k !== 'Home').join()}`);
}
await deniedCtx.close();

// --- 2. A tab: fullscreen, then the lock ------------------------------------

step('a browser tab, where the lock needs fullscreen first');
const { context: tabCtx, page: tab } = await pageWith({ lock: false, fullscreen: true });
await tab.mouse.click(200, 400);
await tab.waitForTimeout(400);
const asked = await calls(tab);
step(`  asked: ${asked.join(' → ')}`);
if (!asked.includes('fullscreen')) {
  fail('the app never asked for fullscreen, so a tab can never turn the phone');
}
// The lock is tried before fullscreen (the installed-app path) and again after.
if (asked.filter((c) => c === 'lock:landscape').length < 2) {
  fail('the lock was not retried once fullscreen was granted');
} else {
  step('  and retried the lock once fullscreen was granted');
}
if (await blockedBy(tab)) fail('the app is covered even after the lock succeeded');
await tabCtx.close();

// --- 3. Settings lets go, and takes it back --------------------------------

step('an installed app, where the lock is granted outright');
const { context: appCtx, page: app } = await pageWith({ lock: true });
const atStart = await calls(app);
if (!atStart.includes('lock:landscape')) fail(`landscape was never asked for (${atStart.join()})`);
else step('  landscape asked for at startup');
// No fullscreen: it costs the browser's own chrome and buys nothing here.
if (atStart.includes('fullscreen')) {
  fail('the app went fullscreen even though the lock was already granted');
}

step('opening the grown-ups screens');
await app.evaluate(() => {
  window.__game.scene.getScene('Home').settingsButton.emit('pointerdown');
});
await app.waitForSelector('.gate', { timeout: 10000 });
const question = await app.textContent('#gate-q');
const [, a, b] = question.match(/What is (\d+) × (\d+)\?/) ?? [];
await app.fill('.gate-input', String(Number(a) * Number(b)));
await app.click('.gate-ok');
await app.waitForSelector('.set-root', { timeout: 10000 });

const afterOpen = await calls(app);
if (afterOpen[afterOpen.length - 1] !== 'unlock') {
  fail(`settings did not release the orientation (${afterOpen.join()})`);
} else {
  step('  released, so the phone can be turned upright to trace');
}

step('closing them again');
await app.click('.set-close');
await app.waitForFunction(() => !document.querySelector('.set-root'), null, { timeout: 10000 });
const afterClose = await calls(app);
if (afterClose[afterClose.length - 1] !== 'lock:landscape') {
  fail(`the lock was not taken back on close (${afterClose.join()})`);
} else {
  step('  and taken back on the way out');
}
await appCtx.close();

// --- 4. Never fullscreen a desktop -----------------------------------------

step('a window with a mouse');
const { context: deskCtx, page: desk } = await pageWith({ lock: false, touch: false });
await desk.mouse.click(200, 400);
await desk.waitForTimeout(300);
const deskCalls = await calls(desk);
if (deskCalls.includes('fullscreen')) {
  fail('a desktop browser was thrown into fullscreen to hold a window sideways');
} else {
  step('  no fullscreen: there is no phone to turn');
}
await deskCtx.close();

await finish();
