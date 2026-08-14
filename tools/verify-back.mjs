/**
 * What the phone's back button does.
 *
 * It used to leave the app, from anywhere. Nothing here touched the History
 * API, so the browser had one entry and back always meant "close the page" —
 * pressing it inside a game dropped a child out entirely.
 *
 * Every screen now pushes a history entry carrying the action that closes it,
 * and every in-app back control goes through the same path, so the ⌂ in the
 * corner and the hardware key cannot disagree. That equivalence is itself one
 * of the checks below.
 *
 * `page.goBack()` is the hardware button: for a same-document `pushState` entry
 * it fires exactly the `popstate` a phone's back key does.
 *
 * Usage: npm run dev &  then  node tools/verify-back.mjs [baseUrl]
 */

import { fail, homeIsUp, openApp, step } from './harness.mjs';

const { page, finish, url } = await openApp({ name: 'back', open: false, waitForHome: false });

const running = () =>
  page.evaluate(() =>
    window.__game.scene
      .getScenes(true)
      .map((s) => s.scene.key)
      .sort()
  );
const screens = () => page.evaluate(() => window.__history.screens());
const settled = () => page.waitForTimeout(450);

/** Opens a game the way a tile does, without depending on where the tile is. */
async function openGame(key) {
  await page.evaluate((k) => window.__game.scene.getScene('Home').openGame(k), key);
  await page.waitForFunction((k) => window.__game.scene.isActive(k), key, { timeout: 10000 });
}

const back = async () => {
  await page.goBack();
  await settled();
};

await page.goto(url, { waitUntil: 'domcontentloaded' });
await homeIsUp(page);
await settled();

if ((await screens()).length !== 0) fail(`the menu already has ${(await screens()).join()} open`);

// --- 1. A game, and back out of it -----------------------------------------
//
// The reported bug: this used to leave the app.

step('a game, then back');
await openGame('Balloons');
if (!(await running()).includes('Balloons')) fail('the game did not open');
if ((await screens()).join() !== 'game:Balloons') {
  fail(`the history holds ${(await screens()).join()} rather than the game`);
}

await back();
const afterBack = await running();
// Both halves: Home up *and* the game gone. During a scene change Phaser has
// the old scene and the new one both active for a frame, so asking only whether
// Home is running would pass on a back that did nothing at all.
if (!afterBack.includes('Home') || afterBack.includes('Balloons')) {
  fail(`back from a game left ${afterBack.join()} running, not just the menu`);
} else {
  step('  back from a game lands on the menu');
}
if ((await screens()).length !== 0) fail(`the game is still on the stack: ${(await screens()).join()}`);

// --- 2. The ⌂ and the back button are the same thing ------------------------
//
// They are one code path now, and this is what says so: whichever is used, the
// app *and the history* end up in the same state, so the next back does the
// same thing after either.

step('the ⌂ button and the back button agree');
await openGame('Balloons');
await page.evaluate(() => {
  const home = window.__game.scene.getScene('Balloons');
  // The one in stage.js, which every game screen carries.
  const button = home.children.list.find((c) => c.type === 'Container' && c.x === 72 && c.y === 56);
  button.emit('pointerdown');
  button.emit('pointerup');
});
await settled();
const viaButton = { running: await running(), screens: await screens() };
if (!viaButton.running.includes('Home') || viaButton.running.includes('Balloons')) {
  fail(`the ⌂ left ${viaButton.running.join()} running, not just the menu`);
}
if (viaButton.screens.length !== 0) {
  fail(`the ⌂ left ${viaButton.screens.join()} on the stack — the history is out of step`);
} else {
  step('  the ⌂ leaves the same state the back button does');
}

// --- 3. The games panel -----------------------------------------------------

step('the games panel, then back');
await page.evaluate(() => window.__game.scene.getScene('Home').openMore());
await settled();
if ((await screens()).join() !== 'games-panel') {
  fail(`opening the panel put ${(await screens()).join()} on the stack`);
}

await back();
const panelGone = await page.evaluate(() => !window.__game.scene.getScene('Home').morePanel?.active);
if (!panelGone) fail('back did not close the games panel');
else if (!(await running()).includes('Home')) fail('back closed the panel and left the menu too');
else step('  back closes the panel and stays on the menu');

// --- 4. Picking a game out of the panel replaces it, not stacks on it -------
//
// Push instead of replace here and back from the game reopens the panel, which
// is not where the child was.

step('a game picked from the panel, then back');
await page.evaluate(() => window.__game.scene.getScene('Home').openMore());
await settled();
// Tapped, not called: the app decides for itself whether picking a game
// replaces the panel or stacks on it, and handing that choice in from here
// would test this file's opinion rather than the app's.
const picked = await page.evaluate(() => {
  const panel = window.__game.scene.getScene('Home').morePanel;
  // The board: the one container whose children are themselves containers.
  // Everything else at this level is the dim sheet, the card, the title, the
  // ← button, the page dots and the page arrows.
  const board = panel.list.find(
    (c) => c.type === 'Container' && c.list?.length && c.list.every((k) => k.type === 'Container')
  );
  const tile = board?.list[0];
  if (!tile) return null;
  tile.emit('pointerdown');
  tile.emit('pointerup');
  return true;
});
if (!picked) fail('could not find a tile in the panel to tap');
// Waiting on the stack rather than on a scene: the tile's tap sits behind a
// deliberate 150ms beat on Phaser's clock, which runs at about half speed
// headless, and a scene is briefly both starting and stopping in between.
await page.waitForFunction(
  () => window.__history.screens().some((name) => name.startsWith('game:')),
  null,
  { timeout: 15000 }
);
await settled();
const opened = (await screens()).join();
if (opened.includes('games-panel')) {
  fail(`the panel is still on the stack: ${opened}`);
} else {
  step(`  picking ${opened.replace('game:', '')} replaced the panel rather than stacking on it`);
}

await back();
const home = await running();
if (!home.includes('Home') || home.length !== 1) {
  fail(`back from a panel-picked game left ${home.join()} running`);
}
const reopened = await page.evaluate(() =>
  Boolean(window.__game.scene.getScene('Home').morePanel?.active)
);
if (reopened) fail('back from the game reopened the panel instead of landing on the menu');
else step('  it goes to the menu, not back to the panel');

// --- 5. The parental gate ---------------------------------------------------

step('the grown-ups question, then back');
await page.evaluate(() => {
  window.__game.scene.getScene('Home').settingsButton.emit('pointerdown');
});
await page.waitForSelector('.gate', { timeout: 10000 });
if ((await screens()).join() !== 'gate') fail(`the gate put ${(await screens()).join()} on the stack`);

await back();
if (await page.$('.gate')) fail('back did not dismiss the question');
else if (await page.$('.set-root')) fail('back through the gate opened settings anyway');
else step('  back dismisses the question without opening settings');

// --- 6. Settings, two levels deep ------------------------------------------

step('settings and a page inside it');
await page.evaluate(() => {
  window.__game.scene.getScene('Home').settingsButton.emit('pointerdown');
});
await page.waitForSelector('.gate', { timeout: 10000 });
const question = await page.textContent('#gate-q');
const [, a, b] = question.match(/What is (\d+) × (\d+)\?/) ?? [];
await page.fill('.gate-input', String(Number(a) * Number(b)));
await page.click('.gate-ok');
await page.waitForSelector('.set-root', { timeout: 10000 });
await settled();
// The gate settles its promise from inside its own unwind, so by the time
// settings opens the gate's entry is gone. If that ordering ever breaks, this
// reads "gate,settings" and the pending unwind takes settings down with it.
if ((await screens()).join() !== 'settings') {
  fail(`settings opened on top of ${(await screens()).join()}`);
} else {
  step('  the gate unwound before settings pushed');
}

await page.click('.set-root [data-page="traces"]');
await page.waitForSelector('.ste-board', { timeout: 20000 });
if ((await screens()).join() !== 'settings,settings:traces') {
  fail(`the traces page put ${(await screens()).join()} on the stack`);
}

await back();
if (!(await page.$('.set-list'))) fail('back from a settings page did not return to the list');
else if (!(await page.$('.set-root'))) fail('back from a settings page closed the whole screen');
else step('  back leaves the page and returns to the list');

await back();
if (await page.$('.set-root')) fail('back from the settings list did not close it');
else if (!(await running()).includes('Home')) fail('closing settings did not return to the menu');
else step('  back again closes settings and the menu is running');
if ((await screens()).length !== 0) fail(`settings left ${(await screens()).join()} behind`);

// --- 7. The × closes the whole thing from inside a page --------------------
//
// One control, two entries. `history.go(-2)` fires a single popstate, so this
// is also the check that the stack unwinds by depth rather than by counting.

step('the × from inside a page');
await page.evaluate(() => {
  window.__game.scene.getScene('Home').settingsButton.emit('pointerdown');
});
await page.waitForSelector('.gate', { timeout: 10000 });
const q2 = await page.textContent('#gate-q');
const [, c, d] = q2.match(/What is (\d+) × (\d+)\?/) ?? [];
await page.fill('.gate-input', String(Number(c) * Number(d)));
await page.click('.gate-ok');
await page.waitForSelector('.set-root', { timeout: 10000 });
await page.click('.set-root [data-page="tune"]');
await page.waitForSelector('[data-tune]', { timeout: 10000 });
await page.click('.set-close');
await settled();

if (await page.$('.set-root')) fail('the × did not close settings from inside a page');
else if ((await screens()).length !== 0) {
  fail(`the × left ${(await screens()).join()} on the stack — it unwound by count, not by depth`);
} else {
  step('  it closes both levels and leaves nothing behind');
}

// --- 8. At the menu, back leaves the app -----------------------------------
//
// A check cannot watch a tab close, but it can assert there is nothing of ours
// left for back to consume — which is what decides whether the browser handles
// it or the app does.

step('at the menu, with nothing open');
const atMenu = await page.evaluate(() => ({
  screens: window.__history.screens(),
  state: window.history.state,
}));
if (atMenu.screens.length !== 0) fail(`the menu is holding ${atMenu.screens.join()}`);
else if (atMenu.state?.depth !== 0) {
  fail(`the menu sits at depth ${atMenu.state?.depth}, so back would not leave the app`);
} else {
  step('  nothing to consume: back belongs to the browser, and leaves');
}

await finish();
