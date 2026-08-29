/* That the daily limit limits, and that it never takes a round away. */

import { fail, homeIsUp, openApp, startScene, step } from './harness.mjs';

/* Must match src/lib/allowance.js. */
const KEY = 'urdu-games:allowance:v1';

/* A game with a rail and a banner, so `wellDone` has something to celebrate. */
const GAME = 'FindLetter';

const { page, finish } = await openApp({ name: 'limit', timeoutMs: 300000 });

const overlay = () => page.$('.timeup-backdrop');
const pause = (ms) => page.waitForTimeout(ms);

/* What the store says right now. */
const allowance = () =>
  page.evaluate(() => ({
    limit: window.__allowance.limitMinutes(),
    spent: window.__allowance.spentMs(),
    up: window.__allowance.isUp(),
  }));

/* Writes the store directly and reloads, the way a phone comes back tomorrow. */
async function reloadWith(state) {
  await page.evaluate(
    ([key, value]) => {
      window.__allowance.setLimitMinutes(0);
      localStorage.setItem(key, JSON.stringify(value));
    },
    [KEY, state]
  );
  await page.reload({ waitUntil: 'domcontentloaded' });
  await homeIsUp(page);
}

/* Today, keyed the way allowance.js keys it. */
const dayKey = (offsetDays = 0) =>
  page.evaluate((offset) => {
    const d = new Date();
    d.setDate(d.getDate() + offset);
    return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
  }, offsetDays);

/* Finishes the activity the way every game finishes one. */
const finishRound = (scene) =>
  page.evaluate((key) => {
    const running = window.__game.scene.getScene(key);
    window.__stage.wellDone(running, { banner: running.banner, rail: running.rail });
  }, scene);

step('no limit set: nothing ever appears');
await startScene(page, GAME);
await pause(1500);
if (await overlay()) fail('a device with no limit set was told to stop');
const idle = await allowance();
if (idle.limit !== 0) fail(`a fresh device came with a ${idle.limit} minute limit`);
if (idle.spent !== 0) fail('a device with no limit was counting anyway');
else step('  nothing counted, nothing shown');

step('the time goes while he is playing');
await page.evaluate(() => {
  window.__allowance.setLimitMinutes(10);
  window.__allowance.endToday();
});
if (!(await allowance()).up) fail('endToday left time on the clock');
// The whole point.
await pause(2000);
if (await overlay()) fail('he was cut off in the middle of a round');
else step('  the round is left alone');

if (!(await page.$(`canvas`))) fail('the game canvas went away');
const stillPlaying = await page.evaluate((key) => window.__game.scene.isActive(key), GAME);
if (!stillPlaying) fail('the game was stopped underneath him');

step('the round finishes');
await finishRound(GAME);
await page.waitForSelector('.timeup-backdrop', { timeout: 10000 }).catch(() => {});
if (!(await overlay())) fail('the round ended and the screen never came');
else step('  and then it says goodnight');

step('it does not close');
await page.click('.timeup-backdrop', { position: { x: 8, y: 8 } });
if (!(await overlay())) fail('tapping beside it closed it');

await page.keyboard.press('Escape');
await pause(200);
if (!(await overlay())) fail('Escape closed it');

await page.click('.timeup-mascot').catch(() => {});
if (!(await overlay())) fail('tapping the mascot closed it');

// Nothing underneath is reachable.
const onTop = await page.evaluate(() => {
  const found = document.elementFromPoint(window.innerWidth / 2, window.innerHeight / 2);
  return found?.closest('.timeup-backdrop') ? 'overlay' : (found?.tagName ?? 'nothing');
});
if (onTop !== 'overlay') fail(`something is drawn over the screen (hit ${onTop})`);
else step('  no tap, no key and no gap gets past it');

step('reopening with the time already gone');
const today = await dayKey();
await reloadWith({ limit: 10, day: today, spent: 10 * 60000 });
await page.waitForSelector('.timeup-backdrop', { timeout: 10000 }).catch(() => {});
if (!(await overlay())) fail('closing and reopening the app handed back a fresh session');
else step('  still finished');

step('coming back the next day');
await reloadWith({ limit: 10, day: await dayKey(-1), spent: 10 * 60000 });
await pause(500);
if (await overlay()) fail('yesterday\'s spent minutes were still spent today');
const fresh = await allowance();
// Not exactly zero: the clock has been running since the reload.
if (fresh.spent > 5000) fail(`the new day started ${Math.round(fresh.spent / 1000)}s in`);
if (fresh.limit !== 10) fail('the rollover forgot the limit a parent chose');
else step('  the minutes reset, the limit stayed');

// Both paths should reach the same state.

step('arriving at the menu with the time gone');
await page.evaluate(() => window.__allowance.endToday());
await startScene(page, 'Home');
await page.waitForSelector('.timeup-backdrop', { timeout: 10000 }).catch(() => {});
if (!(await overlay())) fail('the menu waited for a round that was never going to start');
else step('  shown straight away');

step('and running out while he is sitting on it');
await reloadWith({ limit: 10, day: await dayKey(), spent: 0 });
if (await overlay()) fail('the menu showed it with nine minutes left');
await page.evaluate(() => window.__allowance.endToday());
// Two seconds, not the ninety of GRACE.
await page.waitForSelector('.timeup-backdrop', { timeout: 2000 }).catch(() => {});
if (!(await overlay())) fail('running out at the menu left him ninety seconds of menu');
else step('  shown straight away there too');

// The leak that `elementFromPoint` cannot see.
step('and the menu underneath hears nothing');
const runningBefore = await page.evaluate(() =>
  window.__game.scene.getScenes(true).map((s) => s.scene.key)
);
// On the tiles themselves, asked of the scene rather than guessed at as a fraction of the window.
const targets = await page.evaluate(() => {
  const rect = window.__game.canvas.getBoundingClientRect();
  const scale = rect.width / window.__game.scale.width;
  const board = window.__game.scene.getScene('Home').board;
  return board.list
    .slice(0, 3)
    .map((tile) => [rect.left + tile.x * scale, rect.top + tile.y * scale]);
});
if (targets.length < 3) fail(`only found ${targets.length} tiles to tap`);
for (const [x, y] of targets) {
  // Move, pause, down, pause, up: `page.mouse.click` fires down and up inside one frame and Phaser can miss the pair.
  await page.mouse.move(x, y);
  await page.waitForTimeout(40);
  await page.mouse.down();
  await page.waitForTimeout(60);
  await page.mouse.up();
  await page.waitForTimeout(150);
}
const runningAfter = await page.evaluate(() =>
  window.__game.scene.getScenes(true).map((s) => s.scene.key)
);
if (runningAfter.join() !== runningBefore.join()) {
  // Either direction is the same bug.
  const moved = [
    ...runningAfter.filter((key) => !runningBefore.includes(key)).map((key) => `started ${key}`),
    ...runningBefore.filter((key) => !runningAfter.includes(key)).map((key) => `stopped ${key}`),
  ];
  fail(`tapping the screen got through to the game: ${moved.join(', ') || 'something moved'}`);
} else if (!(await overlay())) {
  fail('tapping the screen closed it');
} else {
  step('  three taps across the tiles started nothing');
}

step('the way back in');
page.once('dialog', (d) => d.accept());
await page.click('.timeup-grown');
await page.waitForSelector('.gate', { timeout: 10000 });
const question = await page.textContent('#gate-q');
const [, a, b] = question.match(/What is (\d+) × (\d+)\?/) ?? [];
if (!a) fail(`could not read the grown-ups question: ${question}`);
await page.fill('.gate-input', String(Number(a) * Number(b)));
await page.click('.gate-ok');
await page.waitForFunction(() => !document.querySelector('.timeup-backdrop'), null, {
  timeout: 10000,
}).catch(() => {});
if (await overlay()) fail('ten more minutes did not put the screen away');
const after = await allowance();
if (after.up) fail('ten more minutes left the clock still empty');
if (after.limit !== 10) fail(`the grant changed tomorrow's limit to ${after.limit}`);
else step('  ten minutes back, and tomorrow unchanged');

step('the question is not answerable by a three-year-old');
await page.evaluate(() => window.__allowance.endToday());
await startScene(page, 'Home');
await page.waitForSelector('.timeup-backdrop', { timeout: 10000 });
await page.click('.timeup-grown');
await page.waitForSelector('.gate', { timeout: 10000 });
await page.fill('.gate-input', '1');
await page.click('.gate-ok');
await pause(400);
if (!(await overlay())) fail('a wrong answer got him back in');
else step('  a wrong answer changes nothing');
await page.keyboard.press('Escape');
await pause(200);

step('the clock stops while a grown-up is in Settings');
await reloadWith({ limit: 30, day: await dayKey(), spent: 0 });
await pause(1200);
const beforeSettings = (await allowance()).spent;
if (beforeSettings === 0) fail('the clock never started');

await page.evaluate(() => {
  window.__game.scene.getScene('Home').settingsButton.emit('pointerdown');
});
await page.waitForSelector('.gate', { timeout: 10000 });
const q2 = await page.textContent('#gate-q');
const [, c, d] = q2.match(/What is (\d+) × (\d+)\?/) ?? [];
await page.fill('.gate-input', String(Number(c) * Number(d)));
await page.click('.gate-ok');
await page.waitForSelector('.set-root', { timeout: 10000 });

const inSettings = (await allowance()).spent;
await pause(3000);
const stillInSettings = (await allowance()).spent;
if (stillInSettings > inSettings) {
  fail(
    `three seconds in Settings cost him ${Math.round((stillInSettings - inSettings) / 1000)}s`
  );
} else {
  step('  three seconds of reading cost him nothing');
}

step('and starts again on the way out');
if (!(await page.$('.set-root [data-page="limit"]'))) fail('Settings has no "time each day" row');
// Waited for rather than clicked straight away: the header is built with the screen and this check has raced it once.
await page.waitForSelector('.set-close', { timeout: 10000 });
await page.click('.set-close');
await page.waitForFunction(() => !document.querySelector('.set-root'), null, { timeout: 10000 });
await pause(2500);
const afterSettings = (await allowance()).spent;
if (afterSettings <= stillInSettings) fail('the clock never started again after Settings closed');
else step('  counting again');

await finish();
