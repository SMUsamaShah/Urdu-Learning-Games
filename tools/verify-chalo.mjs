/* چلو — the button that plays the app for you. */

import { readFileSync, readdirSync } from 'node:fs';
import { fail, homeIsUp, openApp, step } from './harness.mjs';

/* How long the run waits after a celebration before moving on, plus slack. */
const ADVANCE_MS = 20000;

const { page, finish, url } = await openApp({ name: 'chalo', open: false, waitForHome: false });

const state = () =>
  page.evaluate(() => ({
    running: window.__chalo.running(),
    game: window.__chalo.currentGame(),
    awake: window.__game.scene
      .getScenes(true)
      .map((s) => s.scene.key)
      .sort(),
    screens: window.__history.screens(),
  }));

const settled = () => page.waitForTimeout(450);

/* Taps چلو the way a finger does — through the button, not through the run. */
async function tapChalo() {
  const found = await page.evaluate(() => {
    const button = window.__game.scene
      .getScene('Home')
      .children.list.find((c) => c.name === 'chalo-button');
    if (!button) return false;
    button.emit('pointerup');
    return true;
  });
  if (!found) fail('there is no چلو button on the menu');
  // The button waits a beat so the tap is seen to land before the screen goes.
  await page.waitForFunction(() => window.__chalo.running(), null, { timeout: 10000 });
  await settled();
}

/* Ends the activity the run is on, exactly as the game itself would. */
async function finishActivity(key) {
  const how = await page.evaluate((name) => {
    const scene = window.__game.scene.getScene(name);
    if (!scene) return null;
    if (scene.stage) {
      window.__stage.wellDone(scene, scene.stage);
      return 'finished';
    }
    // Flashcards has no finish and no stage; its clock is what moves the run on.
    scene.time.timeScale = 60;
    return 'browsed';
  }, key);
  if (!how) fail(`${key} is not running — the run cannot move on from it`);
  return how;
}

await page.goto(url, { waitUntil: 'domcontentloaded' });
await homeIsUp(page);
await settled();

step('چلو starts something');
const atRest = await state();
if (atRest.running) fail('a run was going before anything was tapped');

await tapChalo();
const started = await state();
if (!started.game) fail('the run started without a game');
else if (!started.awake.includes(started.game)) {
  fail(`the run says ${started.game} but ${started.awake.join() || 'nothing'} is running`);
} else if (started.awake.includes('Home')) {
  fail(`the menu is still running underneath ${started.game}`);
} else step(`  the menu opened ${started.game}`);

if (started.screens.length !== 1) {
  fail(`the first game left ${started.screens.length} history entries, not 1`);
}

step('چلو survives being hammered');
await page.evaluate(() => {
  window.__chalo.stopRun();
  const game = window.__game;
  game.scene.getScenes(true).forEach((s) => game.scene.stop(s.scene.key));
  game.scene.start('Home');
});
await homeIsUp(page);
await page.evaluate(() => window.__history.screens().forEach(() => window.history.back()));
await settled();

await page.evaluate(() => {
  const button = window.__game.scene
    .getScene('Home')
    .children.list.find((c) => c.name === 'chalo-button');
  button.emit('pointerup');
  button.emit('pointerup');
  button.emit('pointerup');
});
await page.waitForFunction(() => window.__chalo.running(), null, { timeout: 10000 });
await page.waitForTimeout(1200);
const hammered = await state();
if (hammered.awake.length !== 1) {
  fail(`three taps started ${hammered.awake.length} screens: ${hammered.awake.join()}`);
} else if (hammered.screens.length !== 1) {
  fail(`three taps left ${hammered.screens.length} history entries: ${hammered.screens.join()}`);
} else step(`  one game (${hammered.game}), one entry`);

step('finishing an activity moves the run on');
const played = [(await state()).game];
for (let round = 0; round < 3; round++) {
  const from = (await state()).game;
  if (!(await finishActivity(from))) break;

  // Both faults at once.
  const moved = await page
    .waitForFunction((was) => window.__chalo.currentGame() !== was, from, {
      timeout: ADVANCE_MS,
    })
    .then(() => true)
    .catch(() => false);
  if (!moved) {
    fail(`finishing ${from} left the run on ${from} — it stalled or dealt it again`);
    break;
  }
  await settled();

  const now = await state();
  played.push(now.game);
  if (!now.awake.includes(now.game)) {
    fail(`the run moved to ${now.game} but it is not running`);
  }
  // The one that just finished has to be gone, not merely covered.
  if (now.awake.includes(from)) {
    fail(`${from} is still running underneath ${now.game}`);
  }
  if (now.awake.includes('Home')) fail(`the menu is running underneath ${now.game}`);
  // And the run stays one press deep however far it goes.
  if (now.screens.length !== 1) {
    fail(`after ${round + 2} games the history holds ${now.screens.length} entries, not 1`);
  }
}
if (!process.exitCode) step(`  ${played.join(' → ')}`);

step('a browsing screen is given a clock');
await page.evaluate(() => {
  const game = window.__game;
  game.scene.getScenes(true).forEach((s) => game.scene.stop(s.scene.key));
  game.scene.start('Flashcards');
});
await page.waitForFunction(() => window.__game.scene.isActive('Flashcards'), null, {
  timeout: 20000,
});
await settled();
const armed = await page.evaluate(() => {
  const clock = window.__game.scene.getScene('Flashcards').time;
  return [...clock._active, ...clock._pendingInsertion].map((event) => event.delay);
});
if (!armed.some((delay) => delay >= 30000)) {
  fail(`Flashcards has no browse timer during a run (delays: ${armed.join() || 'none'})`);
} else step(`  armed for ${Math.max(...armed) / 1000}s`);

step('back ends the run');
await page.goBack();
await settled();
const home = await state();
if (!home.awake.includes('Home')) fail(`back left ${home.awake.join()} up, not the menu`);
if (home.running) fail('back landed on the menu with the run still going');
if (home.screens.length !== 0) fail(`back left ${home.screens.join()} on the stack`);
if (!process.exitCode) step('  the menu, with nothing running');

// A game finishing after that must not drag the child out of the menu again.
await page.evaluate(() => {
  const game = window.__game;
  game.scene.start('Balloons');
});
await page.waitForFunction(() => window.__game.scene.isActive('Balloons'), null, {
  timeout: 20000,
});
await settled();
await finishActivity('Balloons');
await page.waitForTimeout(4000);
const after = await state();
if (after.running || after.game) fail(`a finish after back restarted the run on ${after.game}`);
else step('  and a later finish does not restart it');

step('every game reaches wellDone');
const sceneDir = new URL('../src/scenes/', import.meta.url);
const sources = Object.fromEntries(
  readdirSync(sceneDir)
    .filter((name) => name.endsWith('.js'))
    .map((name) => [name.replace(/\.js$/, ''), readFileSync(new URL(name, sceneDir), 'utf8')])
);
const playable = [...readFileSync(new URL('../src/lib/games.js', import.meta.url), 'utf8')
  .matchAll(/scene:\s*'([A-Za-z]+)'/g)].map((match) => match[1]);
/* Whether a scene calls wellDone, following `extends` where it does not. */
const finishes = (key, seen = new Set()) => {
  if (seen.has(key)) return false;
  seen.add(key);
  const source = sources[key];
  if (!source) return false;
  if (source.includes('wellDone(')) return true;
  const parent = source.match(/extends\s+([A-Za-z]+)/);
  return parent ? finishes(parent[1], seen) : false;
};
const silent = playable.filter(
  // Flashcards browses; it gets a clock instead, checked above.
  (key) => key !== 'Flashcards' && !finishes(key)
);
if (silent.length) fail(`these never finish anything: ${silent.join(', ')}`);
else step(`  ${playable.length} games, all of which finish`);

await finish();
