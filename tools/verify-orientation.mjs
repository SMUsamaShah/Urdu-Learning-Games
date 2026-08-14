/**
 * Which way up the app holds itself, and what happens where it cannot.
 *
 * The games are drawn at 1280×720, so upright they letterbox into a strip and
 * a three-year-old cannot aim at anything. The app used to be pinned sideways
 * by `orientation: 'landscape'` in the manifest, which also pinned the
 * grown-ups screens — and the tracing editor wants a tall window and a finger.
 * So the manifest asks for nothing and the lock is applied and released in
 * JavaScript.
 *
 * That trade only works if the fallback is real: `screen.orientation.lock` does
 * not exist on iOS, and a phone that cannot be held sideways must say so rather
 * than quietly serving an unplayable game. Both halves are checked here, with
 * the API faked in each direction — there is no way to actually rotate a
 * headless browser, and the interesting behaviour is what the app does with
 * what the API tells it.
 *
 * Usage: npm run dev &  then  node tools/verify-orientation.mjs [baseUrl]
 */

import fs from 'node:fs';
import path from 'node:path';
import { fail, homeIsUp, openApp, step } from './harness.mjs';
import { ROOT } from './audio-keys.mjs';

const PORTRAIT = { width: 412, height: 890 };
const LANDSCAPE = { width: 890, height: 412 };

// --- the manifest must not do the locking ----------------------------------
//
// A manifest lock is absolute: it cannot be released for one screen, which is
// the whole reason this file exists. If it comes back, everything below still
// passes and the phone still will not turn.

const config = fs.readFileSync(path.join(ROOT, 'vite.config.js'), 'utf8');
const declared = config.match(/orientation: '([a-z-]+)'/)?.[1];
step(`the manifest asks for orientation: ${declared}`);
if (declared !== 'any') {
  fail(`the manifest pins orientation to "${declared}", so no screen can ever turn`);
}

const { browser, context, finish, url } = await openApp({
  name: 'orientation',
  open: false,
  waitForHome: false,
  context: { viewport: PORTRAIT, hasTouch: true },
});

/**
 * A page whose Screen Orientation API is whatever we say it is.
 *
 * `supported: false` is an iPhone: the property exists and has no `lock`.
 * Calls are recorded so the checks can assert what the app asked for rather
 * than only what happened to it.
 */
async function pageWith({ supported }) {
  const created = await context.newPage();
  await created.addInitScript((canLock) => {
    window.__orientationCalls = [];
    const fake = {
      type: 'portrait-primary',
      angle: 0,
      addEventListener() {},
      removeEventListener() {},
      unlock() {
        window.__orientationCalls.push('unlock');
      },
    };
    if (canLock) {
      fake.lock = (which) => {
        window.__orientationCalls.push(`lock:${which}`);
        return Promise.resolve();
      };
    }
    Object.defineProperty(window.screen, 'orientation', {
      value: fake,
      configurable: true,
    });
  }, supported);
  await created.goto(url, { waitUntil: 'domcontentloaded' });
  await homeIsUp(created);
  return created;
}

const cardShowing = (page) =>
  page.evaluate(() => Boolean(document.querySelector('.turn-card.is-on')));
const calls = (page) => page.evaluate(() => window.__orientationCalls.slice());

/** Through the gate, the way a parent gets to the tracing editor. */
async function openSettings(page) {
  await page.evaluate(() => {
    window.__game.scene.getScene('Home').settingsButton.emit('pointerdown');
  });
  await page.waitForSelector('.gate', { timeout: 10000 });
  const question = await page.textContent('#gate-q');
  const [, a, b] = question.match(/What is (\d+) × (\d+)\?/) ?? [];
  await page.fill('.gate-input', String(Number(a) * Number(b)));
  await page.click('.gate-ok');
  await page.waitForSelector('.set-root', { timeout: 10000 });
}

// --- 1. Where the lock works ------------------------------------------------

step('a browser that can be told which way up');
const android = await pageWith({ supported: true });
const asked = await calls(android);
if (!asked.includes('lock:landscape')) fail(`the app never asked for landscape (${asked.join()})`);
else step('  it asked for landscape at startup');

// Held sideways by the browser, so there is nothing to ask the child to do.
if (await cardShowing(android)) fail('the turn-your-phone card is up despite the lock being granted');
else step('  no card, because the lock was granted');

// --- 2. Settings lets go, and takes it back --------------------------------

step('opening the grown-ups screens');
await openSettings(android);
const afterOpen = await calls(android);
if (afterOpen[afterOpen.length - 1] !== 'unlock') {
  fail(`settings did not release the orientation (${afterOpen.join()})`);
} else {
  step('  the lock was released, so the phone can be turned to trace');
}

// And the card stays away while it is released: on a screen meant to work
// upright, asking for it to be turned would be telling somebody off for doing
// the right thing.
if (await cardShowing(android)) fail('the card is up on a screen that is meant to work upright');
else step('  and no card while it is released');

step('closing them again');
await android.click('.set-close');
await android.waitForFunction(() => !document.querySelector('.set-root'), null, { timeout: 10000 });
const afterClose = await calls(android);
if (afterClose[afterClose.length - 1] !== 'lock:landscape') {
  fail(`the lock was not taken back on close (${afterClose.join()})`);
} else {
  step('  landscape asked for again on the way out');
}
await android.close();

// --- 3. Where the lock does not exist --------------------------------------
//
// An iPhone. Nothing can hold the app sideways, so a game opened upright would
// letterbox into a strip — and the person holding it cannot read an apology.

step('a browser with no lock at all');
const iphone = await pageWith({ supported: false });
if (!(await cardShowing(iphone))) {
  fail('held upright with no lock available, the game shows no ask to turn the phone');
} else {
  step('  the turn-your-phone card is up');
}

// It is a picture, not a sentence: whoever is holding the phone is three.
const wordy = await iphone.evaluate(() => document.querySelector('.turn-card').innerText.trim());
if (wordy.length > 2) fail(`the card is asking in words: "${wordy}"`);

step('turning it sideways');
await iphone.setViewportSize(LANDSCAPE);
await iphone.waitForFunction(() => !document.querySelector('.turn-card.is-on'), null, {
  timeout: 5000,
});
step('  the card went away on its own');

// The grown-ups screens are usable either way up, so the card must not come
// back there when the phone is turned upright to trace.
step('upright, in settings, with no lock available');
await iphone.setViewportSize(PORTRAIT);
await iphone.waitForSelector('.turn-card.is-on', { timeout: 5000 });
await openSettings(iphone);
if (await cardShowing(iphone)) {
  fail('the card covers the settings screen, which is meant to be used upright');
} else {
  step('  no card: this is the screen you are supposed to turn the phone for');
}

await iphone.close();

// --- 4. And never on something that cannot be turned -----------------------
//
// Desktop Chrome has `lock()` and refuses it outside fullscreen, so without a
// guard a browser window dragged taller than it is wide would be covered by a
// card telling somebody to rotate their monitor. A coarse pointer is the test:
// a finger means a device that can actually be turned.

step('a tall window with a mouse');
const desktop = await browser.newContext({ viewport: PORTRAIT, hasTouch: false });
const mouse = await desktop.newPage();
await mouse.addInitScript(() => {
  window.__orientationCalls = [];
  Object.defineProperty(window.screen, 'orientation', {
    value: {
      type: 'portrait-primary',
      angle: 0,
      addEventListener() {},
      removeEventListener() {},
      unlock() {},
      // What desktop Chrome does outside fullscreen.
      lock: () => Promise.reject(new Error('not allowed')),
    },
    configurable: true,
  });
});
await mouse.goto(url, { waitUntil: 'domcontentloaded' });
await homeIsUp(mouse);
if (await cardShowing(mouse)) {
  fail('a desktop window is being told to turn the phone it does not have');
} else {
  step('  no card: nothing to turn');
}
await desktop.close();

await finish();
