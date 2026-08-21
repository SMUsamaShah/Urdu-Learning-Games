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

// --- 1. Upright and refused: the app turns itself ---------------------------
//
// Rotation switched off, or a browser that will not fullscreen. The app used to
// sit in a letterboxed band across the middle of the screen here, which is the
// thing that was wrong with it: unplayably small for a three-year-old aiming at
// balloons. It turns itself sideways now and fills the screen, and the phone is
// what gets held that way.
//
// Two claims, and the second is the one worth having. Filling the screen is
// visible in a screenshot; taps landing where they were aimed is not, and a
// rotated canvas is exactly where that silently stops being true. See the note
// about Phaser's two DOM questions in src/lib/turn.js.

step('upright, with nothing granted at all');
const { context: deniedCtx, page: denied } = await pageWith({ lock: false, fullscreen: false });

const covering = await blockedBy(denied);
if (covering) fail(`the app is covered by ${covering} instead of being shown`);
else step('  nothing is covering the app');

const shown = await denied.evaluate(() => {
  const el = document.querySelector('canvas');
  const box = el?.getBoundingClientRect();
  const stage = document.getElementById('stage');
  return box
    ? {
        w: Math.round(box.width),
        h: Math.round(box.height),
        left: Math.round(box.left),
        top: Math.round(box.top),
        turn: Number(stage?.dataset.turn ?? 0),
        view: { w: window.innerWidth, h: window.innerHeight },
      }
    : null;
});

if (!shown) {
  fail('there is no canvas at all');
} else if (!shown.turn) {
  fail('the window is upright and the app did not turn itself sideways');
} else {
  // Within a pixel of the whole window, on all four edges. This is the actual
  // complaint — "I dont want empty space on sides" — and it is the assertion
  // that would have caught it.
  const slack = 2;
  const fills =
    Math.abs(shown.left) <= slack &&
    Math.abs(shown.top) <= slack &&
    Math.abs(shown.w - shown.view.w) <= slack &&
    Math.abs(shown.h - shown.view.h) <= slack;
  if (!fills) {
    fail(
      `the app leaves empty space: ${shown.w}x${shown.h} at ${shown.left},${shown.top} ` +
        `in a ${shown.view.w}x${shown.view.h} window`
    );
  } else {
    step(`  turned ${shown.turn}° and filling the window, ${shown.w}x${shown.h}`);
  }
}

// Visible is not the same as working, and the difference is a tap.
//
// **A real one, through the mouse.** This used to `emit('pointerdown')` on the
// tile, which proves the handler is wired and proves nothing about where a
// finger has to land to reach it — and where a finger lands is the entire
// question on a rotated canvas. Phaser reads a tap's page coordinates through
// its scale manager, whose idea of the canvas comes from a bounding rect that
// is the *rotated* box, so an un-patched app maps every tap to the wrong place
// while looking perfect in a screenshot. See src/lib/turn.js.
//
// The page point is worked out here from the stage's own geometry rather than
// asked of the app, so this is not the code under test agreeing with itself.
step('  tapping a game tile, with the mouse, where it appears on screen');
await denied.evaluate(() => {
  window.__game.scene.getScene('Home').input.enabled = true;
});

const aim = await denied.evaluate(() => {
  const game = window.__game;
  const tile = game.scene.getScene('Home').children.list.find((c) => c.name === 'tile');
  if (!tile) return null;
  const stage = document.getElementById('stage');
  const rect = stage.getBoundingClientRect();
  const canvas = game.canvas;
  const box = { w: parseFloat(stage.style.width), h: parseFloat(stage.style.height) };
  const local = {
    x: (box.w - canvas.offsetWidth) / 2 + (tile.x * canvas.offsetWidth) / game.scale.width,
    y: (box.h - canvas.offsetHeight) / 2 + (tile.y * canvas.offsetHeight) / game.scale.height,
  };
  const turn = Number(stage.dataset.turn);
  const on =
    turn === 90
      ? { x: rect.width - local.y, y: local.x }
      : turn === 270
        ? { x: local.y, y: rect.height - local.x }
        : local;
  return { x: rect.left + on.x, y: rect.top + on.y };
});

let opened = [];
if (!aim) {
  fail('there is no tile on the menu to tap');
} else {
  // Moved, pressed, released, with a beat between each: a click delivered
  // inside one frame can be over before Phaser has processed the press, which
  // fails for reasons that have nothing to do with where it landed.
  await denied.mouse.move(aim.x, aim.y);
  await denied.waitForTimeout(140);
  await denied.mouse.down();
  await denied.waitForTimeout(140);
  await denied.mouse.up();
  await denied.waitForTimeout(1400);
  opened = await denied.evaluate(() =>
    window.__game.scene.getScenes(true).map((s) => s.scene.key)
  );
}
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

// --- 3. Settings stays landscape too ---------------------------------------

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

// The reverse of what this used to assert. Settings released the lock so the
// phone could be turned upright to trace a letter; the app is landscape on
// every screen now, and an `unlock` anywhere in here means one screen has gone
// back to behaving differently from the rest of the app.
const afterOpen = await calls(app);
if (afterOpen.includes('unlock')) {
  fail(`settings released the orientation (${afterOpen.join()})`);
} else {
  step('  and the lock is kept: the grown-ups screens are landscape too');
}

step('closing them again');
await app.click('.set-close');
await app.waitForFunction(() => !document.querySelector('.set-root'), null, { timeout: 10000 });
const afterClose = await calls(app);
if (afterClose.includes('unlock')) {
  fail(`the orientation was released somewhere in settings (${afterClose.join()})`);
} else {
  step('  with nothing released on the way in or out');
}

// Settings is inside the stage, not the body. Outside it, the app can be lying
// on its side while Settings stands upright over the top of it — which is the
// state a grown-up opens Settings *from* on a phone that will not turn.
const mounted = await app.evaluate(() => {
  const root = document.querySelector('.set-root');
  return root ? Boolean(root.closest('#stage')) : null;
});
if (mounted === false) fail('settings is mounted outside #stage, so it will not turn with the app');
else if (mounted) step('  mounted inside the stage, so it turns with the app');
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
