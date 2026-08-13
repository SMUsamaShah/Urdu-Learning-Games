/**
 * Checks the ring: that it is there, that it fills, and that it never empties
 * by accident.
 *
 * The whole point of this feature is that a child sees the same total grow
 * across every game and across days, so the things worth checking are the ones
 * that would quietly break that:
 *
 *   - A screen with no ring on it. The ring is created in addStage, so a game
 *     that builds its own chrome would simply not have one, and nobody would
 *     notice until a child asked where their stars went.
 *   - A right answer that awards nothing, or awards twice.
 *   - A wrong answer that costs something. This is the promise the design is
 *     built on and the one a refactor is most likely to break.
 *   - A level boundary that does not roll over, or rolls over without the ring
 *     redrawing — the model and the drawing are separate and can disagree.
 *   - A total that does not survive a reload, which turns a week of progress
 *     into a session's.
 *
 * Read off the ring rather than the model wherever it can be: a model that
 * counts perfectly while the arc draws nothing is exactly the failure a
 * model-only test would pass.
 *
 * Usage: npm run dev &  then  node tools/verify-progress.mjs [baseUrl]
 */

import { fail, openApp, startScene, step } from './harness.mjs';

/** Screens to check carry a ring. Every game, plus the menu. */
const SCREENS = [
  'Home',
  'Flashcards',
  'FindLetter',
  'Balloons',
  'WordPictures',
  'Numbers',
  'Memory',
  'Sequence',
  'JoinForms',
  'StartsWith',
  'Doors',
  'TapAll',
  'Caterpillar',
  'LetterPuzzle',
  'Fishing',
  'Baskets',
  'Whack',
  'OddOne',
  'InOrder',
  'Paint',
  'ConnectPairs',
  'NumberLine',
  'Hidden',
  'Bounce',
  'Trace',
];

const KEY = 'urdu-games:progress:v1';

const { page, finish } = await openApp({ name: 'progress' });

/** Sets the saved total and reloads onto a fresh Home. */
async function seed(total) {
  await page.evaluate(
    ([key, value]) => localStorage.setItem(key, String(value)),
    [KEY, total]
  );
  await page.reload();
  await page.waitForFunction(() => window.__game?.scene.isActive('Home'), null, {
    timeout: 30000,
  });
  await page.waitForTimeout(400);
}

/** What the ring on the running screen is showing. */
const ringState = (scene) =>
  page.evaluate((name) => {
    const found = window.__game.scene
      .getScene(name)
      .children.list.find((child) => child.name === 'progress-ring');
    if (!found) return null;
    return { drawn: found.drawn, level: found.level, digits: found.list.at(-1).list.length };
  }, scene);

const model = () => page.evaluate(() => window.__progress.state());

// --- 1. Every screen has one ----------------------------------------------

step('checking every screen carries a ring');
const missing = [];
for (const scene of SCREENS) {
  if (scene !== 'Home') await startScene(page, scene);
  await page.waitForTimeout(150);
  const ring = await ringState(scene);
  if (!ring) missing.push(scene);
  else if (!Number.isFinite(ring.drawn)) missing.push(`${scene} (drew nothing)`);
}
for (const scene of missing) fail(`${scene}: no progress ring — does it call addStage()?`);
if (!missing.length) step(`${SCREENS.length} screens, all showing the ring`);

// --- 2. A right answer fills it, a wrong one does not ----------------------

await seed(0);
const fresh = await model();
if (fresh.total !== 0 || fresh.level !== 0) {
  fail(`a fresh device starts at level ${fresh.level + 1} with ${fresh.total} — expected level 1, 0`);
}

await startScene(page, 'FindLetter');
await page.waitForTimeout(500);
const before = await ringState('FindLetter');

step('a wrong answer');
await page.evaluate(() => {
  const scene = window.__game.scene.getScene('FindLetter');
  const wrong = scene.choicesLayer.list.find((t) => t.choiceId !== scene.target);
  wrong?.emit('pointerup');
});
await page.waitForTimeout(900);
const afterWrong = await model();
if (afterWrong.total !== 0) {
  fail(`a wrong answer moved the total to ${afterWrong.total} — it must cost nothing`);
} else step('cost nothing, as it must');

step('a right answer');
await page.evaluate(() => {
  const scene = window.__game.scene.getScene('FindLetter');
  scene.choicesLayer.list.find((t) => t.choiceId === scene.target).emit('pointerup');
});
// The arc is deliberately slow — it waits for a flying star — so this waits on
// the drawing rather than on the model, which moves immediately.
const filled = await page
  .waitForFunction(
    (was) => {
      const ring = window.__game.scene
        .getScene('FindLetter')
        .children.list.find((child) => child.name === 'progress-ring');
      return ring && ring.drawn > was + 0.01;
    },
    before.drawn,
    { timeout: 15000 }
  )
  .then(() => true)
  .catch(() => false);
const afterRight = await model();
if (afterRight.total !== 1) fail(`one right answer counted ${afterRight.total}`);
else if (!filled) fail('the total went up but the arc never moved');
else step(`counted once, arc ${before.drawn.toFixed(2)} -> filled`);

// --- 3. The level boundary -------------------------------------------------

step('crossing a level');
// One short of the level, so the next single award rolls it over. Awarded
// through the running app rather than by writing storage, so the ring's
// listener is what is under test.
const { steps, step: at } = await model();
await page.evaluate((n) => {
  for (let i = 0; i < n; i++) window.__progress.award(1);
}, steps - at - 1);
await page.waitForTimeout(1200);
const brink = await ringState('FindLetter');
if (brink.level !== 0) fail(`levelled up early, at ${brink.level}`);

await page.evaluate(() => window.__progress.award(1));
const rolled = await page
  .waitForFunction(
    () => {
      const ring = window.__game.scene
        .getScene('FindLetter')
        .children.list.find((child) => child.name === 'progress-ring');
      return ring && ring.level === 1 && ring.drawn < 0.2;
    },
    null,
    { timeout: 20000 }
  )
  .then(() => true)
  .catch(() => false);
if (!rolled) {
  const now = await ringState('FindLetter');
  fail(`the ring did not roll over: level ${now.level}, arc at ${now.drawn.toFixed(2)}`);
} else step('level 2, and the arc started again from empty');

// --- 4. It survives a reload ----------------------------------------------

step('coming back tomorrow');
const saved = (await model()).total;
await page.reload();
await page.waitForFunction(() => window.__game?.scene.isActive('Home'), null, { timeout: 30000 });
await page.waitForTimeout(600);
const restored = await model();
if (restored.total !== saved) {
  fail(`${saved} before the reload, ${restored.total} after — progress is not being saved`);
} else step(`${saved} still there`);

const onMenu = await ringState('Home');
if (!onMenu || onMenu.level !== restored.level) {
  fail(`the menu's ring shows level ${onMenu?.level} against the saved ${restored.level}`);
}

// Two digits, at level 10. The numerals are drawn one glyph each and the
// second one has never been on screen before this point.
await seed(200);
const high = await model();
const highRing = await ringState('Home');
if (highRing?.digits !== String(high.level + 1).length) {
  fail(
    `level ${high.level + 1} drew ${highRing?.digits} numeral(s) — ` +
      `a two-digit level is showing one digit`
  );
} else step(`level ${high.level + 1} draws ${highRing.digits} numerals`);

// --- 5. Starting again -----------------------------------------------------

await page.evaluate(() => window.__progress.reset());
await page.waitForTimeout(400);
const cleared = await model();
const clearedRing = await ringState('Home');
if (cleared.total !== 0) fail(`reset left ${cleared.total} behind`);
else if (clearedRing.level !== 0 || clearedRing.drawn > 0.01) {
  fail(`reset cleared the total but the ring still shows level ${clearedRing.level + 1}`);
} else step('reset clears the total and the ring');

await finish();
