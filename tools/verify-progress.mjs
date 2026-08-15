/**
 * Checks the plant: that it is there, that it grows, and that it grows back.
 *
 * The whole point of this feature is that a child sees one thing get bigger
 * across every game and across days, so the things worth checking are the ones
 * that would quietly break that:
 *
 *   - A screen with no plant on it. It is created in addStage, so a game that
 *     builds its own chrome would simply not have one, and nobody would notice
 *     until a child asked where their tree went.
 *   - A right answer that waters nothing, or waters twice.
 *   - A wrong answer that costs the wrong amount. **This assertion is the
 *     reverse of what it used to be.** It used to read "a wrong answer must
 *     cost nothing", and was described here as the promise the design was built
 *     on; a wrong answer now costs two pours and is allowed to cross back a
 *     level. See the note in src/lib/progress.js for why that changed, and note
 *     that the floor at zero is the part of the old promise that survives.
 *   - A level boundary that does not roll over, or rolls over without the plant
 *     being replanted — the model and the drawing are separate and can disagree.
 *   - A total that does not survive a reload, which turns a week of progress
 *     into a session's.
 *
 * Read off the drawing rather than the model wherever it can be: `drawn` is the
 * key of the texture actually on screen, and a model that counts perfectly
 * while the picture never changes is exactly the failure a model-only test
 * would pass.
 *
 * Usage: npm run dev &  then  node tools/verify-progress.mjs [baseUrl]
 */

import { fail, openApp, startScene, step } from './harness.mjs';

/** Screens to check carry a plant. Every game, plus the menu. */
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

/** Flashcards is a letter and its word with no furniture at all — see its create(). */
const NO_PLANT = new Set(['Flashcards']);

const KEY = 'urdu-games:progress:v1';
/** Must match SETBACK in src/lib/progress.js. */
const SETBACK = 2;

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

/** What the plant on the running screen is showing. */
const plantState = (scene) =>
  page.evaluate((name) => {
    const found = window.__game.scene
      .getScene(name)
      .children.list.find((child) => child.name === 'progress-plant');
    if (!found) return null;
    return {
      step: found.step,
      growth: found.growth,
      trees: found.trees,
      species: found.species,
      drawn: found.drawn,
      row: found.row,
    };
  }, scene);

const model = () => page.evaluate(() => window.__progress.state());

/** Waits for the drawing to catch up — a pour takes a beat of falling water. */
const drawnSettles = (scene, was) =>
  page
    .waitForFunction(
      ([name, before]) => {
        const found = window.__game.scene
          .getScene(name)
          .children.list.find((child) => child.name === 'progress-plant');
        return found && found.drawn !== before;
      },
      [scene, was],
      { timeout: 15000 }
    )
    .then(() => true)
    .catch(() => false);

// --- 1. Every screen has one ----------------------------------------------

step('checking every screen carries a plant');
const missing = [];
for (const scene of SCREENS) {
  if (scene !== 'Home') await startScene(page, scene);
  await page.waitForTimeout(150);
  const plant = await plantState(scene);
  if (NO_PLANT.has(scene)) {
    if (plant) fail(`${scene} grew a plant it is meant not to have`);
    continue;
  }
  if (!plant) missing.push(scene);
  else if (!plant.drawn) missing.push(`${scene} (drew nothing)`);
}
for (const scene of missing) fail(`${scene}: no plant — does it call addStage()?`);
if (!missing.length) step(`${SCREENS.length - NO_PLANT.size} screens, all showing it`);

// --- 2. A right answer waters it, a wrong one takes water back -------------

await seed(0);
const fresh = await model();
if (fresh.total !== 0 || fresh.level !== 0) {
  fail(`a fresh device starts at level ${fresh.level + 1} with ${fresh.total} — expected level 1, 0`);
}

// Something to lose, and a round that has not been locked by a previous
// answer: QuizScene stops taking taps for a beat and a half after each one, so
// a tap sent inside that window is silently ignored and every assertion after
// it passes for the wrong reason.
await seed(6);
await startScene(page, 'FindLetter');
await page.waitForTimeout(600);

step('a wrong answer, tapped for real');
const drawnBefore = (await plantState('FindLetter')).drawn;
await page.evaluate(() => {
  const scene = window.__game.scene.getScene('FindLetter');
  const wrong = scene.choicesLayer.list.find((t) => t.choiceId !== scene.target);
  wrong?.emit('pointerup');
});
await page.waitForTimeout(1000);
const afterWrong = await model();
if (afterWrong.total !== 6 - SETBACK) {
  fail(`a wrong answer moved 6 to ${afterWrong.total} — expected ${6 - SETBACK}`);
} else if ((await plantState('FindLetter')).drawn === drawnBefore) {
  fail('the total came down but the plant kept the same picture');
} else step(`  cost ${SETBACK} pours, and the plant shrank back`);

step('a wrong answer with nothing left to lose');
// The floor is what is left of the old promise: a child cannot be put into
// debt for guessing on their first go.
await page.evaluate(() => {
  window.__progress.reset();
  window.__progress.setback();
  window.__progress.setback();
});
await page.waitForTimeout(600);
if ((await model()).total !== 0) {
  fail(`setbacks took a fresh device to ${(await model()).total}`);
} else step('  stopped at nothing, rather than going below it');

await seed(0);
await startScene(page, 'FindLetter');
await page.waitForTimeout(600);

step('a right answer');
const before = await plantState('FindLetter');
await page.evaluate(() => {
  const scene = window.__game.scene.getScene('FindLetter');
  scene.choicesLayer.list.find((t) => t.choiceId === scene.target).emit('pointerup');
});
const grew = await drawnSettles('FindLetter', before.drawn);
const afterRight = await model();
if (afterRight.total !== 1) fail(`one right answer counted ${afterRight.total}`);
else if (!grew) fail('the total went up but the plant never redrew');
else step(`  counted once, and the pot went from ${before.drawn} to a bigger frame`);

// --- 3. The level boundary -------------------------------------------------

step('growing a tree all the way');
// One short of the level, so the next single award rolls it over. Awarded
// through the running app rather than by writing storage, so the plant's
// listener is what is under test.
const { steps, step: at } = await model();
await page.evaluate((n) => {
  for (let i = 0; i < n; i++) window.__progress.award(1);
}, steps - at - 1);
await page.waitForTimeout(1400);
const brink = await plantState('FindLetter');
if (brink.trees !== 0) fail(`a tree was banked early, at ${brink.trees}`);

const seedBefore = brink.species;
const rowBefore = brink.row;
await page.evaluate(() => window.__progress.award(1));
// The ceremony holds the fruit on screen before replanting, so this waits for
// the far side of it rather than for the model, which moves at once.
const replanted = await page
  .waitForFunction(
    () => {
      const found = window.__game.scene
        .getScene('FindLetter')
        .children.list.find((child) => child.name === 'progress-plant');
      return found && found.trees === 1 && found.step === 0;
    },
    null,
    { timeout: 20000 }
  )
  .then(() => true)
  .catch(() => false);
if (!replanted) {
  const now = await plantState('FindLetter');
  fail(`no replant: ${now.trees} tree(s) banked, pot at step ${now.step}`);
} else {
  const after = await plantState('FindLetter');
  if (after.species === seedBefore) {
    fail(`the next seed is another ${after.species} — it should be a different one`);
  } else if (after.row === rowBefore) {
    // Read off the sprite, not off the model: the count can be right while the
    // row behind the pot is still the picture it was before the tree fruited.
    fail(`a tree was banked but the row is still drawing ${after.row}`);
  } else step(`  one tree banked, drawn as ${after.row}, and a fresh ${after.species} seed`);
}

// --- 4. A bad run can cost a tree ------------------------------------------

step('crossing back down a level');
const treesBefore = (await plantState('FindLetter')).trees;
await page.evaluate(() => {
  // Two setbacks from the very start of a tree, which is the case that has to
  // reach back into the one before it.
  window.__progress.setback();
  window.__progress.setback();
});
await page.waitForTimeout(1200);
const dropped = await plantState('FindLetter');
if (dropped.trees !== treesBefore - 1) {
  fail(`going back a level left ${dropped.trees} trees, not ${treesBefore - 1}`);
} else if (dropped.row !== `orchard:${treesBefore - 1}`) {
  fail(`the count dropped to ${dropped.trees} but the row still draws ${dropped.row}`);
} else step(`  ${treesBefore} trees became ${dropped.trees}, and the row redrew`);

// --- 5. It survives a reload ----------------------------------------------

step('coming back tomorrow');
const saved = (await model()).total;
await page.reload();
await page.waitForFunction(() => window.__game?.scene.isActive('Home'), null, { timeout: 30000 });
await page.waitForTimeout(600);
const restored = await model();
if (restored.total !== saved) {
  fail(`${saved} before the reload, ${restored.total} after — progress is not being saved`);
} else step(`  ${saved} still there`);

const onMenu = await plantState('Home');
if (!onMenu || onMenu.trees !== restored.level) {
  fail(`the menu shows ${onMenu?.trees} trees against the saved level ${restored.level}`);
}

// A long way in: the row of finished trees stops growing at eight, and the
// plant must still draw rather than falling over on an index it has no spot for.
await seed(200);
const high = await plantState('Home');
if (!high?.drawn) fail('a long-played device drew no plant at all');
else step(`  level ${(await model()).level + 1} still draws, with the row of trees capped`);

// --- 6. Starting again -----------------------------------------------------

await page.evaluate(() => window.__progress.reset());
await page.waitForTimeout(600);
const cleared = await model();
const clearedPlant = await plantState('Home');
if (cleared.total !== 0) fail(`reset left ${cleared.total} behind`);
else if (clearedPlant.trees !== 0 || clearedPlant.step !== 0) {
  fail(
    `reset cleared the total but the garden still shows ${clearedPlant.trees} ` +
      `trees and a pot at step ${clearedPlant.step}`
  );
} else step('reset clears the total and the garden');

await finish();
