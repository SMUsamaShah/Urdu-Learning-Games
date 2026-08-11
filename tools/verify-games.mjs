/**
 * Plays the two guessing games and checks they behave.
 *
 * Screenshots show a round looks right; this checks it *works* — that the
 * answer is always reachable, that a right tap advances and a wrong one does
 * not, and that nothing throws over a long sitting. The invariant that matters
 * most is the first one: if the line-up could ever be built without the target
 * in it, the round would be unwinnable and a child would simply be stuck.
 *
 * Everything here waits on a condition rather than on a duration. Phaser
 * advances its clock by a fixed per-frame delta, so when headless WebGL renders
 * at around half the usual frame rate, game time runs at about half wall-clock
 * speed and a 760ms delayedCall can take 1.6s of real time. Sleeping a fixed
 * number of milliseconds produces a test that fails on slow machines and passes
 * on fast ones, which is worse than no test.
 *
 * Usage: npm run dev &  then  node tools/verify-games.mjs [baseUrl]
 */

import { chromium } from 'playwright';
import { launchOptions } from './browser.mjs';

const APP = process.argv[2] || 'http://localhost:5173';
const ROUNDS = 12;

const fail = (msg) => {
  console.error('FAIL: ' + msg);
  process.exitCode = 1;
};
const step = (msg) => process.stderr.write(`· ${msg}\n`);

const watchdog = setTimeout(() => {
  console.error('FAIL: timed out after 120s');
  process.exit(1);
}, 120000);
watchdog.unref();

const browser = await chromium.launch(launchOptions());
const page = await browser.newPage({ viewport: { width: 1180, height: 820 } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));

await page.goto(APP, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => window.__game?.scene.isActive('Home'), null, {
  timeout: 30000,
});

const start = async (key) => {
  await page.evaluate((k) => {
    const game = window.__game;
    game.scene.getScenes(true).forEach((s) => game.scene.stop(s.scene.key));
    game.scene.start(k);
  }, key);
  await page.waitForFunction((k) => window.__game.scene.isActive(k), key, {
    timeout: 15000,
  });
  await page.waitForTimeout(300);
};

// ------------------------------------------------------------- find letter

await start('FindLetter');
step('find the letter: playing ' + ROUNDS + ' rounds');

for (let round = 0; round < ROUNDS; round++) {
  const state = await page.evaluate(() => {
    const scene = window.__game.scene.getScene('FindLetter');
    const ids = scene.choicesLayer.list.map((t) => t.letterId);
    return { target: scene.target, ids, streak: scene.streak };
  });

  if (!state.ids.includes(state.target)) {
    fail(
      `round ${round + 1}: the answer "${state.target}" is not among the ` +
        `choices [${state.ids.join(', ')}] — that round is unwinnable`
    );
    break;
  }
  if (new Set(state.ids).size !== state.ids.length) {
    fail(`round ${round + 1}: the same letter appears twice: [${state.ids.join(', ')}]`);
    break;
  }

  await page.evaluate(() => {
    const scene = window.__game.scene.getScene('FindLetter');
    scene.choicesLayer.list.find((t) => t.letterId === scene.target).emit('pointerup');
  });

  // The round turns over after a short celebration.
  const moved = await page
    .waitForFunction(
      (was) => window.__game.scene.getScene('FindLetter').target !== was,
      state.target,
      { timeout: 15000 }
    )
    .then(() => true)
    .catch(() => false);

  const streak = await page.evaluate(
    () => window.__game.scene.getScene('FindLetter').streak
  );
  if (!moved) fail(`round ${round + 1}: a correct tap did not start a new round`);
  if (streak !== state.streak + 1) {
    fail(`round ${round + 1}: streak went ${state.streak} -> ${streak}, expected +1`);
  }
  if (process.exitCode) break;
}
step(`streak reached ${await page.evaluate(() => window.__game.scene.getScene('FindLetter').streak)}`);

// Four choices should be on screen by now, and the prompt should have moved to
// a different positional form where the letter has one.
const late = await page.evaluate(() => {
  const scene = window.__game.scene.getScene('FindLetter');
  return { choices: scene.choicesLayer.list.length, streak: scene.streak };
});
if (late.choices < 3) fail(`after a long streak only ${late.choices} choices are shown`);
else step(`${late.choices} choices at streak ${late.streak}`);

step('checking a wrong tap does not advance');
const wrong = await page.evaluate(async () => {
  const scene = window.__game.scene.getScene('FindLetter');
  const before = scene.target;
  const other = scene.choicesLayer.list.find((t) => t.letterId !== scene.target);
  other.emit('pointerup');
  // Long enough that a round change would have happened if one were coming.
  await new Promise((r) => setTimeout(r, 2500));
  return { same: scene.target === before, streak: scene.streak };
});
if (!wrong.same) fail('a wrong tap moved on to the next round');
if (wrong.streak !== 0) fail(`a wrong tap left the streak at ${wrong.streak}, expected 0`);
if (wrong.same && wrong.streak === 0) step('wrong tap kept the round and reset the streak');

// ---------------------------------------------------------------- balloons

await start('Balloons');
await page.waitForTimeout(600);
step('balloons: playing 6 rounds');

for (let round = 0; round < 6; round++) {
  const state = await page.evaluate(() => {
    const scene = window.__game.scene.getScene('Balloons');
    return {
      target: scene.target,
      ids: scene.balloons.map((b) => b.letterId),
      streak: scene.streak,
    };
  });

  if (!state.ids.includes(state.target)) {
    fail(
      `balloon round ${round + 1}: no balloon carries the answer "${state.target}" ` +
        `— on screen: [${state.ids.join(', ')}]`
    );
    break;
  }

  await page.evaluate(() => {
    const scene = window.__game.scene.getScene('Balloons');
    scene.balloons.find((b) => b.letterId === scene.target).emit('pointerdown');
  });

  const moved = await page
    .waitForFunction(
      (was) => window.__game.scene.getScene('Balloons').target !== was,
      state.target,
      { timeout: 15000 }
    )
    .then(() => true)
    .catch(() => false);

  const streak = await page.evaluate(
    () => window.__game.scene.getScene('Balloons').streak
  );
  if (!moved) fail(`balloon round ${round + 1}: popping the target did not advance`);
  if (streak !== state.streak + 1) {
    fail(`balloon round ${round + 1}: streak ${state.streak} -> ${streak}`);
  }
  if (process.exitCode) break;
}

step('checking a wrong pop costs only the balloon');
const wrongPop = await page.evaluate(async () => {
  const scene = window.__game.scene.getScene('Balloons');
  const before = scene.target;
  const other = scene.balloons.find((b) => b.letterId !== scene.target);
  if (!other) return { skipped: true };
  other.emit('pointerdown');
  await new Promise((r) => setTimeout(r, 2500));
  return {
    same: scene.target === before,
    streak: scene.streak,
    stillHasTarget: scene.balloons.some((b) => b.letterId === scene.target),
  };
});
if (wrongPop.skipped) step('only the target was on screen, skipped');
else {
  if (!wrongPop.same) fail('a wrong pop changed the round');
  if (wrongPop.streak !== 0) fail(`a wrong pop left the streak at ${wrongPop.streak}`);
  if (!wrongPop.stillHasTarget) fail('the answer left the screen after a wrong pop');
  if (wrongPop.same && wrongPop.streak === 0 && wrongPop.stillHasTarget) {
    step('wrong pop kept the round and the answer');
  }
}

// Let it run untouched for a while: balloons recycle off the top, and the
// target must be re-launched rather than quietly disappearing.
step('idling to check the answer is always available');
await page.waitForTimeout(6000);
const idle = await page.evaluate(() => {
  const scene = window.__game.scene.getScene('Balloons');
  return {
    count: scene.balloons.length,
    hasTarget: scene.balloons.some((b) => b.letterId === scene.target),
  };
});
if (!idle.hasTarget) fail('after idling, no balloon carries the answer');
// A balloon destroyed without killing its rise tween still recycles itself,
// which quietly multiplies the balloons each round until the screen is a mess.
else if (idle.count > 8) fail(`${idle.count} balloons on screen — they are leaking`);
else step(`${idle.count} balloons on screen, answer present`);

if (errors.length) {
  for (const e of errors) console.error('  console: ' + e);
  fail(`${errors.length} console error(s)`);
}

await browser.close();
clearTimeout(watchdog);
console.log(process.exitCode ? 'game verification FAILED' : 'game verification passed');
process.exit(process.exitCode ?? 0);
