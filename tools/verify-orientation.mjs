/* Which way up the app holds itself, and that it never blocks the view to do it. */

import fs from 'node:fs';
import path from 'node:path';
import { fail, homeIsUp, openApp, step } from './harness.mjs';
import { ROOT } from './audio-keys.mjs';

const PORTRAIT = { width: 412, height: 890 };

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

/* A page whose orientation and fullscreen APIs are whatever we say they are. */
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
            // A tab is allowed the lock only once it is fullscreen, which is the whole reason the app asks for fullscreen at all.
            return grantsLock || document.fullscreenElement
              ? Promise.resolve()
              : Promise.reject(new Error('not allowed'));
          },
        },
      });
      // Patch the prototype before the page creates its DOM.
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

/* Anything covering the app. */
const blockedBy = (page) =>
  page.evaluate(() => {
    const at = document.elementFromPoint(window.innerWidth / 2, window.innerHeight / 2);
    if (!at || at.tagName === 'CANVAS') return null;
    const box = at.getBoundingClientRect();
    const covers = box.width >= window.innerWidth * 0.9 && box.height >= window.innerHeight * 0.9;
    return covers ? `${at.tagName}.${at.className}` : null;
  });

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
  // Within a pixel of the whole window, on all four edges.
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
step('  tapping a game tile, with the mouse, where it appears on screen');
await denied.evaluate(() => {
  window.__game.scene.getScene('Home').input.enabled = true;
});

const aim = await denied.evaluate(() => {
  const game = window.__game;
  // Walked, not filtered: the menu's tiles sit inside the container the pager slides, so a flat scan of `children.list`.
  const found = [];
  const walk = (list) => {
    for (const item of list) {
      if (item.name === 'tile') found.push(item);
      if (item.list) walk(item.list);
    }
  };
  walk(game.scene.getScene('Home').children.list);
  const tile = found[0];
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
  // Move, press, and release across separate frames.
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

// The app should remain landscape in both viewport shapes.
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

// Settings is inside the stage, not the body.
const mounted = await app.evaluate(() => {
  const root = document.querySelector('.set-root');
  return root ? Boolean(root.closest('#stage')) : null;
});
if (mounted === false) fail('settings is mounted outside #stage, so it will not turn with the app');
else if (mounted) step('  mounted inside the stage, so it turns with the app');
await appCtx.close();

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
