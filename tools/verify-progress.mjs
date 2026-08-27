/* Checks the rail: that it is there, that it fills, and that it empties again. */

import { fail, openApp, startScene, step } from './harness.mjs';

/* Screens to check carry the rail. */
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
  'BuildWord',
  'FillLetter',
  'JoinWord',
  'Trace',
];

/* Flashcards is a letter and its word with no furniture at all — see its create(). */
/* Flashcards is a letter and its word with no furniture at all — see its create(). */
const NO_RAIL = new Set(['Flashcards', 'Home']);

const KEY = 'urdu-games:progress:v1';
/* Must match SETBACK in src/lib/progress.js. */
const SETBACK = 2;

/* Which indicator to run all of this against. */
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

/* Sets the saved total and reloads onto a fresh Home. */
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

/* What the rail on the running screen is showing. */
const railState = (scene) =>
  page.evaluate((name) => {
    const found = window.__game.scene
      .getScene(name)
      .children.list.find((child) => child.name === 'progress-rail');
    if (!found) return null;
    return {
      total: found.total,
      levels: found.levels,
      // Whatever the indicator publishes.
      drawn: found.indicator?.drawn,
      row: found.indicator?.row,
      species: found.indicator?.species,
      // Only the one with somebody on it publishes this.
      rider: found.indicator?.rider,
    };
  }, scene);

const model = () => page.evaluate(() => window.__progress.state());

/* Waits for the drawing to catch up — growing takes a beat. */
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

await seed(0);
// What "nothing earned" looks like on whichever indicator is in the rail.
await startScene(page, 'FindLetter');
const empty = (await railState('FindLetter'))?.drawn;
const fresh = await model();
if (fresh.total !== 0 || fresh.level !== 0) {
  fail(`a fresh device starts at level ${fresh.level + 1} with ${fresh.total} — expected level 1, 0`);
}

// Something to lose, and a round that has not been locked by a previous answer: QuizScene stops taking taps for a beat.
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
// A child cannot lose progress below zero.
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

step('climbing a whole level');
// One short of the level, so the next single award rolls it over.
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
// The ceremony holds the flower on screen before the next one starts.
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
  // Separate from the wait above.
  if (after.row !== undefined && after.row === rowBefore) {
    fail(`a level was banked but the row is still drawing ${after.row}`);
  } else if (after.row !== undefined && !String(after.row).endsWith(':1')) {
    fail(`one level is banked but the row draws ${after.row}`);
  } else step(`  one level banked, drawn as ${after.drawn}`);
}

step('crossing back down a level');
const beforeDrop = await railState('FindLetter');
const bankedBefore = beforeDrop.levels;
await page.evaluate(() => {
  // Two setbacks from the very start of a level, which is the case that has to reach back into the one before it.
  window.__progress.setback();
  window.__progress.setback();
});
await page.waitForTimeout(1200);
const dropped = await railState('FindLetter');
if (dropped.levels !== bankedBefore - 1) {
  fail(`going back a level left ${dropped.levels} banked, not ${bankedBefore - 1}`);
  // Where there is a row.
} else if (dropped.row !== undefined && !String(dropped.row).endsWith(`:${bankedBefore - 1}`)) {
  fail(`the count dropped to ${dropped.levels} but the row still draws ${dropped.row}`);
} else if (dropped.drawn === beforeDrop.drawn) {
  fail(`the count dropped to ${dropped.levels} but the rail is drawing what it was`);
} else step(`  ${bankedBefore} banked became ${dropped.levels}, and the rail redrew`);

step('a rider comes back down');
// Nine, which is the middle of the second level: a setback from there stays inside the level.
await seed(9);
await startScene(page, 'FindLetter');
await page.waitForTimeout(400);
const riding = await railState('FindLetter');
if (riding.rider === undefined) {
  step('  nothing riding this one');
} else {
  const height = riding.rider;
  await page.evaluate(() => window.__progress.setback());
  const fell = await page
    .waitForFunction(
      (was) => {
        const found = window.__game.scene
          .getScene('FindLetter')
          .children.list.find((child) => child.name === 'progress-rail');
        // Down the screen is up in y, so falling is the number growing.
        return found && found.indicator?.rider > was + 4;
      },
      height,
      { timeout: 15000 }
    )
    .then(() => true)
    .catch(() => false);
  if (!fell) {
    const now = await railState('FindLetter');
    fail(`the rider was at ${height} and is at ${now.rider} — it should have come down`);
  } else step(`  fell from ${height}`);
}

step('coming back tomorrow');
const saved = (await model()).total;
await page.reload();
await page.waitForFunction(() => window.__game?.scene.isActive('Home'), null, { timeout: 30000 });
await page.waitForTimeout(600);
const restored = await model();
if (restored.total !== saved) {
  fail(`${saved} before the reload, ${restored.total} after — progress is not being saved`);
} else step(`  ${saved} still there`);

await startScene(page, 'FindLetter');
const reopened = await railState('FindLetter');
if (!reopened || reopened.levels !== restored.level) {
  fail(`the rail shows ${reopened?.levels} banked against the saved level ${restored.level}`);
}

// Verify that the indicator still draws after reaching its cap.
await seed(200);
await startScene(page, 'FindLetter');
const high = await railState('FindLetter');
if (!high?.drawn) fail('a long-played device drew nothing in the rail at all');
else step(`  level ${(await model()).level + 1} still draws, with the row capped`);

await page.evaluate(() => window.__progress.reset());
await page.waitForTimeout(600);
const cleared = await model();
const clearedRail = await railState('FindLetter');
if (cleared.total !== 0) fail(`reset left ${cleared.total} behind`);
else if (clearedRail.levels !== 0 || clearedRail.drawn !== empty) {
  fail(
    `reset cleared the total but the rail still shows ${clearedRail.levels} ` +
      `finished and is drawing ${clearedRail.drawn}, not ${empty}`
  );
} else step('reset clears the total and the rail');

await finish();
