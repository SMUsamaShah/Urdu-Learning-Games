/**
 * Plays every game and checks it behaves.
 *
 * Screenshots show a round looks right; this checks it *works* — that the
 * answer is always reachable, that a right answer advances and a wrong one does
 * not, and that nothing throws over a long sitting. The invariant that matters
 * most is the first one: if a line-up could ever be built without the target in
 * it, the round would be unwinnable and a child has no way to tell that it is
 * the game that is broken rather than themselves.
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

/** The scenes built on QuizScene, which all answer to the same driving. */
const QUIZZES = [
  { key: 'FindLetter', rounds: 12 },
  { key: 'WordPictures', rounds: 8 },
  { key: 'Numbers', rounds: 8 },
];

const fail = (msg) => {
  console.error('FAIL: ' + msg);
  process.exitCode = 1;
};
const step = (msg) => process.stderr.write(`· ${msg}\n`);

const watchdog = setTimeout(() => {
  console.error('FAIL: timed out after 300s');
  process.exit(1);
}, 300000);
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
    timeout: 20000,
  });
  await page.waitForTimeout(400);
};

const sceneState = (key) =>
  page.evaluate((k) => {
    const scene = window.__game.scene.getScene(k);
    return {
      target: scene.target,
      ids: scene.choicesLayer.list.map((t) => t.choiceId),
      streak: scene.streak,
    };
  }, key);

// ------------------------------------------------------------- the quizzes

for (const { key, rounds } of QUIZZES) {
  await start(key);
  step(`${key}: playing ${rounds} rounds`);

  for (let round = 0; round < rounds; round++) {
    const state = await sceneState(key);

    if (!state.ids.includes(state.target)) {
      fail(
        `${key} round ${round + 1}: the answer "${state.target}" is not among ` +
          `[${state.ids.join(', ')}] — that round is unwinnable`
      );
      break;
    }
    if (new Set(state.ids).size !== state.ids.length) {
      fail(`${key} round ${round + 1}: a choice appears twice: [${state.ids.join(', ')}]`);
      break;
    }

    await page.evaluate((k) => {
      const scene = window.__game.scene.getScene(k);
      scene.choicesLayer.list.find((t) => t.choiceId === scene.target).emit('pointerup');
    }, key);

    const moved = await page
      .waitForFunction(
        ([k, was]) => window.__game.scene.getScene(k).target !== was,
        [key, state.target],
        { timeout: 20000 }
      )
      .then(() => true)
      .catch(() => false);

    const streak = await page.evaluate(
      (k) => window.__game.scene.getScene(k).streak,
      key
    );
    if (!moved) fail(`${key} round ${round + 1}: a correct answer did not advance`);
    if (streak !== state.streak + 1) {
      fail(`${key} round ${round + 1}: streak ${state.streak} -> ${streak}, expected +1`);
    }
    if (process.exitCode) break;
  }
  if (process.exitCode) break;

  const late = await sceneState(key);
  if (late.ids.length < 3) {
    fail(`${key}: only ${late.ids.length} choices after a streak of ${late.streak}`);
  } else {
    step(`${key}: ${late.ids.length} choices at streak ${late.streak}`);
  }

  const wrong = await page.evaluate(async (k) => {
    const scene = window.__game.scene.getScene(k);
    const before = scene.target;
    scene.choicesLayer.list.find((t) => t.choiceId !== scene.target).emit('pointerup');
    // Long enough that a round change would have happened if one were coming.
    await new Promise((r) => setTimeout(r, 2500));
    return { same: scene.target === before, streak: scene.streak };
  }, key);

  if (!wrong.same) fail(`${key}: a wrong answer moved on to the next round`);
  if (wrong.streak !== 0) fail(`${key}: a wrong answer left the streak at ${wrong.streak}`);
  if (wrong.same && wrong.streak === 0) {
    step(`${key}: wrong answer kept the round and reset the streak`);
  }
}

// ---------------------------------------------------------------- balloons

if (!process.exitCode) {
  await start('Balloons');
  await page.waitForTimeout(600);
  step('Balloons: playing 6 rounds');

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
        { timeout: 20000 }
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

  // Let it run untouched: balloons recycle off the top, and the target must be
  // re-launched rather than quietly disappearing.
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
}

// ------------------------------------------------------------------ memory

if (!process.exitCode) {
  await start('Memory');
  step('Memory: checking the board is solvable');

  const board = () =>
    page.evaluate(() => {
      const scene = window.__game.scene.getScene('Memory');
      return {
        cards: scene.cards.map((c) => ({
          pairId: c.pairId,
          kind: c.kind,
          faceUp: c.faceUp,
          done: c.done,
        })),
        matched: scene.matched,
        round: scene.round,
      };
    });

  const first = await board();

  // The invariant that makes this game playable at all: every card has exactly
  // one partner, and a pair is one letter and one picture. A board with an odd
  // card out cannot be finished, and the child has no way to tell that it is
  // the game that is stuck rather than themselves.
  const counts = new Map();
  for (const card of first.cards) {
    counts.set(card.pairId, [...(counts.get(card.pairId) ?? []), card.kind]);
  }
  for (const [pairId, kinds] of counts) {
    if (kinds.length !== 2) {
      fail(`"${pairId}" is on the board ${kinds.length} times, not twice`);
      continue;
    }
    const sorted = [...kinds].sort().join(',');
    if (sorted !== 'letter,picture') {
      fail(`"${pairId}" is a ${sorted} pair, not a letter and a picture`);
    }
  }
  if (!process.exitCode) step(`${counts.size} pairs, each a letter and a picture`);

  /** Waits for the board to accept input again. */
  const settle = () =>
    page.waitForFunction(() => !window.__game.scene.getScene('Memory').locked, null, {
      timeout: 20000,
    });

  /** Turns two cards over by index. */
  const turnTwo = async (a, b) => {
    await settle();
    await page.evaluate(([i, j]) => {
      const scene = window.__game.scene.getScene('Memory');
      scene.cards[i].emit('pointerup');
      scene.cards[j].emit('pointerup');
    }, [a, b]);
  };

  // A wrong pair must turn back over, or the board solves itself by attrition.
  const wrongA = first.cards.findIndex((c) => c.kind === 'letter');
  const wrongB = first.cards.findIndex(
    (c, i) => i !== wrongA && c.pairId !== first.cards[wrongA].pairId
  );
  if (wrongB === -1) {
    step('only one pair on the board, skipping the mismatch check');
  } else {
    await turnTwo(wrongA, wrongB);
    const turnedBack = await page
      .waitForFunction(
        ([i, j]) => {
          const scene = window.__game.scene.getScene('Memory');
          return !scene.cards[i].faceUp && !scene.cards[j].faceUp && !scene.locked;
        },
        [wrongA, wrongB],
        { timeout: 20000 }
      )
      .then(() => true)
      .catch(() => false);
    if (!turnedBack) fail('a mismatched pair did not turn back over');
    else step('mismatched pair turned back over');
  }

  // Solve the whole board. Finishing has to start a new one, or the game ends
  // in a dead screen.
  step('Memory: solving the board');
  const solved = await (async () => {
    for (let i = 0; i < 12; i++) {
      const state = await board();
      const next = state.cards.findIndex((c) => !c.done);
      if (next === -1) return true;
      const partner = state.cards.findIndex(
        (c, index) => index !== next && c.pairId === state.cards[next].pairId
      );
      await turnTwo(next, partner);
      const took = await page
        .waitForFunction(
          ([i, j]) => {
            const scene = window.__game.scene.getScene('Memory');
            return scene.cards[i].done && scene.cards[j].done;
          },
          [next, partner],
          { timeout: 20000 }
        )
        .then(() => true)
        .catch(() => false);
      if (!took) {
        fail(`a matching pair was not accepted (cards ${next} and ${partner})`);
        return false;
      }
    }
    return false;
  })();

  if (solved) {
    const moved = await page
      .waitForFunction(
        (was) => {
          const scene = window.__game.scene.getScene('Memory');
          return scene.round > was && scene.matched === 0 && !scene.locked;
        },
        first.round,
        { timeout: 30000 }
      )
      .then(() => true)
      .catch(() => false);
    if (!moved) fail('finishing the board did not start a new one');
    else step('board finished and a new one dealt');
  }
}

if (errors.length) {
  for (const e of errors) console.error('  console: ' + e);
  fail(`${errors.length} console error(s)`);
}

await browser.close();
clearTimeout(watchdog);
console.log(process.exitCode ? 'game verification FAILED' : 'game verification passed');
process.exit(process.exitCode ?? 0);
