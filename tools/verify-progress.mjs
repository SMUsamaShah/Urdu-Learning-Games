/**
 * Checks the rail: that it is there, that it fills, and that it empties again.
 *
 * The whole point of this feature is that a child sees one thing get bigger
 * across every game and across days, so the things worth checking are the ones
 * that would quietly break that:
 *
 *   - A screen with no rail on it. It is created in addStage, so a game that
 *     builds its own chrome would simply not have one, and nobody would notice
 *     until a child asked where their vine went.
 *   - A right answer that waters nothing, or waters twice.
 *   - A wrong answer that costs the wrong amount. **This assertion is the
 *     reverse of what it used to be.** It used to read "a wrong answer must
 *     cost nothing", and was described here as the promise the design was built
 *     on; a wrong answer now costs two pours and is allowed to cross back a
 *     level. See the note in src/lib/progress.js for why that changed, and note
 *     that the floor at zero is the part of the old promise that survives.
 *   - A level boundary that does not roll over, or rolls over without the thing
 *     in the rail starting again — the model and the drawing are separate and
 *     can disagree.
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

/** Screens to check carry the rail. Every game, plus the menu. */
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
const NO_RAIL = new Set(['Flashcards']);

const KEY = 'urdu-games:progress:v1';
/** Must match SETBACK in src/lib/progress.js. */
const SETBACK = 2;

/**
 * Which indicator to run all of this against.
 *
 * The level ceremony and the setback that crosses a level are the two paths
 * every indicator implements for itself, and Settings decides which one a
 * device is looking at — so a run against the default proves nothing about the
 * others. `INDICATOR=tree npm run verify:progress` puts a different one in the
 * rail before the first load.
 */
const INDICATOR = process.env.INDICATOR || '';

const { page, finish } = await openApp({ name: 'progress' });

if (INDICATOR) {
  await page.evaluate((id) => localStorage.setItem('urdu-games:indicator', id), INDICATOR);
  await page.reload();
  await page.waitForFunction(() => window.__game?.scene.isActive('Home'), null, {
    timeout: 30000,
  });
  step(`against the ${INDICATOR}`);
}

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

/** What the rail on the running screen is showing. */
const railState = (scene) =>
  page.evaluate((name) => {
    const found = window.__game.scene
      .getScene(name)
      .children.list.find((child) => child.name === 'progress-rail');
    if (!found) return null;
    return {
      total: found.total,
      levels: found.levels,
      // Whatever the indicator publishes: for the vine, the count of leaves
      // actually visible and the plant read off the bud's texture; for the bar
      // and the glass, the level and the fraction actually drawn. Read off the
      // drawing rather than off the model.
      drawn: found.indicator?.drawn,
      row: found.indicator?.row,
      species: found.indicator?.species,
    };
  }, scene);

const model = () => page.evaluate(() => window.__progress.state());

/** Waits for the drawing to catch up — growing takes a beat. */
const drawnSettles = (scene, was) =>
  page
    .waitForFunction(
      ([name, before]) => {
        const found = window.__game.scene
          .getScene(name)
          .children.list.find((child) => child.name === 'progress-rail');
        return found && found.indicator?.drawn !== before;
      },
      [scene, was],
      { timeout: 15000 }
    )
    .then(() => true)
    .catch(() => false);

// --- 1. Every screen has one ----------------------------------------------

step('checking every screen carries a rail');
const missing = [];
for (const scene of SCREENS) {
  if (scene !== 'Home') await startScene(page, scene);
  await page.waitForTimeout(150);
  const rail = await railState(scene);
  if (NO_RAIL.has(scene)) {
    if (rail) fail(`${scene} grew a rail it is meant not to have`);
    continue;
  }
  if (!rail) missing.push(scene);
  else if (!rail.drawn) missing.push(`${scene} (drew nothing)`);
}
for (const scene of missing) fail(`${scene}: no rail — does it call addStage()?`);
if (!missing.length) step(`${SCREENS.length - NO_RAIL.size} screens, all showing it`);

// --- 2. A right answer waters it, a wrong one takes water back -------------

await seed(0);
// What "nothing earned" looks like on whichever indicator is in the rail. The
// reset at the end is checked against this rather than against a string shape:
// a fresh vine draws `vine:glory:0` and a fresh bar `bar:0:0.000`, and a check
// that knows about one of those is a check that only ever ran on one.
const empty = (await railState('Home'))?.drawn;
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
const drawnBefore = (await railState('FindLetter')).drawn;
await page.evaluate(() => {
  const scene = window.__game.scene.getScene('FindLetter');
  const wrong = scene.choicesLayer.list.find((t) => t.choiceId !== scene.target);
  wrong?.emit('pointerup');
});
await page.waitForTimeout(1000);
const afterWrong = await model();
if (afterWrong.total !== 6 - SETBACK) {
  fail(`a wrong answer moved 6 to ${afterWrong.total} — expected ${6 - SETBACK}`);
} else if ((await railState('FindLetter')).drawn === drawnBefore) {
  fail('the total came down but the rail kept the same picture');
} else step(`  cost ${SETBACK}, and the rail emptied back`);

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
const before = await railState('FindLetter');
await page.evaluate(() => {
  const scene = window.__game.scene.getScene('FindLetter');
  scene.choicesLayer.list.find((t) => t.choiceId === scene.target).emit('pointerup');
});
const grew = await drawnSettles('FindLetter', before.drawn);
const afterRight = await model();
if (afterRight.total !== 1) fail(`one right answer counted ${afterRight.total}`);
else if (!grew) fail('the total went up but the rail never redrew');
else step(`  counted once, and the rail went from ${before.drawn} to a fuller frame`);

// --- 3. The level boundary -------------------------------------------------

step('climbing a whole level');
// One short of the level, so the next single award rolls it over. Awarded
// through the running app rather than by writing storage, so the indicator's
// listener is what is under test.
const { steps, step: at } = await model();
await page.evaluate((n) => {
  for (let i = 0; i < n; i++) window.__progress.award(1);
}, steps - at - 1);
await page.waitForTimeout(1400);
const brink = await railState('FindLetter');
if (brink.levels !== 0) fail(`a level was banked early, at ${brink.levels}`);

const seedBefore = brink.species;
const rowBefore = brink.row;
await page.evaluate(() => window.__progress.award(1));
// The ceremony holds the flower on screen before the next one starts, so this
// waits for the far side of it rather than for the model, which moves at once.
//
// The wait is the assertion, and deliberately so. Every indicator holds
// something on screen for a second or two before the next one starts — a
// flower opening, a fruit swelling, a glass being drunk — and how long that
// takes is its own business, so there is no duration to wait out and no
// picture this file can name. What it can insist on is that the next one
// *does* start: a different plant where the indicator says what it is growing,
// and a different drawing where it does not. Falling out of the wait is the
// failure, and the message below says so.
const restarted = await page
  .waitForFunction(
    ([was, wasSpecies]) => {
      const found = window.__game.scene
        .getScene('FindLetter')
        .children.list.find((child) => child.name === 'progress-rail');
      if (!found || found.levels !== 1) return false;
      const shown = found.indicator;
      if (shown?.species !== undefined) return shown.species !== wasSpecies;
      return shown?.drawn !== was;
    },
    [brink.drawn, seedBefore],
    { timeout: 20000 }
  )
  .then(() => true)
  .catch(() => false);
if (!restarted) {
  const now = await railState('FindLetter');
  fail(
    `the level never restarted: ${now.levels} banked, still growing ` +
      `${now.species ?? now.drawn} — it should be a different one by now`
  );
} else {
  const after = await railState('FindLetter');
  // Separate from the wait above, and not implied by it: what is growing can
  // change over while the row of finished ones is never redrawn, which is the
  // half of a level that accumulates. Read off the sprites, not off the model.
  // A row is the growing indicators' contract; the bar and the glass carry a
  // level colour and nothing else, and are not asked for one.
  if (after.row !== undefined && after.row === rowBefore) {
    fail(`a level was banked but the row is still drawing ${after.row}`);
  } else if (after.row !== undefined && !String(after.row).endsWith(':1')) {
    fail(`one level is banked but the row draws ${after.row}`);
  } else step(`  one level banked, drawn as ${after.drawn}`);
}

// --- 4. A bad run can cost a level -----------------------------------------

step('crossing back down a level');
const beforeDrop = await railState('FindLetter');
const bankedBefore = beforeDrop.levels;
await page.evaluate(() => {
  // Two setbacks from the very start of a level, which is the case that has to
  // reach back into the one before it.
  window.__progress.setback();
  window.__progress.setback();
});
await page.waitForTimeout(1200);
const dropped = await railState('FindLetter');
if (dropped.levels !== bankedBefore - 1) {
  fail(`going back a level left ${dropped.levels} banked, not ${bankedBefore - 1}`);
  // Where there is a row, it has to *name* the smaller count rather than merely
  // be a different string: an indicator that redrew it wrongly would pass a
  // check for "changed".
} else if (dropped.row !== undefined && !String(dropped.row).endsWith(`:${bankedBefore - 1}`)) {
  fail(`the count dropped to ${dropped.levels} but the row still draws ${dropped.row}`);
} else if (dropped.drawn === beforeDrop.drawn) {
  fail(`the count dropped to ${dropped.levels} but the rail is drawing what it was`);
} else step(`  ${bankedBefore} banked became ${dropped.levels}, and the rail redrew`);

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

const onMenu = await railState('Home');
if (!onMenu || onMenu.levels !== restored.level) {
  fail(`the menu shows ${onMenu?.levels} banked against the saved level ${restored.level}`);
}

// A long way in: the row of finished levels stops growing at its cap, and the
// indicator must still draw rather than falling over on an index it has no spot
// for.
await seed(200);
const high = await railState('Home');
if (!high?.drawn) fail('a long-played device drew nothing in the rail at all');
else step(`  level ${(await model()).level + 1} still draws, with the row capped`);

// --- 6. Starting again -----------------------------------------------------

await page.evaluate(() => window.__progress.reset());
await page.waitForTimeout(600);
const cleared = await model();
const clearedRail = await railState('Home');
if (cleared.total !== 0) fail(`reset left ${cleared.total} behind`);
else if (clearedRail.levels !== 0 || clearedRail.drawn !== empty) {
  fail(
    `reset cleared the total but the rail still shows ${clearedRail.levels} ` +
      `finished and is drawing ${clearedRail.drawn}, not ${empty}`
  );
} else step('reset clears the total and the rail');

await finish();
