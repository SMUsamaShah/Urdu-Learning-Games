/**
 * Checks the strip down the left of every game screen.
 *
 * The rail is new furniture on twenty-four screens at once, and the ways it can
 * be wrong are all quiet ones:
 *
 *   - **A screen without it.** Built in addStage, so a game that assembles its
 *     own chrome would simply not have one.
 *   - **A game drawing into it.** Every scene used to reserve its own left
 *     margin — 250, 268, 280, 300, 320, 330, all guesses at the same thing —
 *     and those are now `RAIL_EDGE + something`. A tile that overlaps the panel
 *     is a tile half hidden behind it, and the child taps a picture they cannot
 *     see.
 *   - **The way out buried.** The home button sits on the panel. The rail is
 *     drawn at a depth, so being added afterwards is not enough to be above it,
 *     and ⌂ disappearing under the strip would strand a child in a game.
 *   - **An indicator that does not move.** Three of them now; a change to the
 *     shared contract can leave one of them drawing the same thing forever, and
 *     only whichever is currently chosen would ever be noticed.
 *
 * Usage: npm run dev &  then  node tools/verify-rail.mjs [baseUrl]
 */

import { fail, openApp, startScene, step } from './harness.mjs';

/** Every game. Flashcards is deliberately bare — see its create(). */
const GAMES = [
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

const { page, finish } = await openApp({ name: 'rail' });

/**
 * The rail's width, read from the app.
 *
 * It was a copy of `RAIL` typed in here with a comment saying it must match
 * theme.js, and the first time the rail changed width the copy did not: every
 * screen's prompt card was suddenly reported as reaching into a panel it was
 * thirty pixels clear of. A check that has to be edited whenever the thing it
 * checks moves is a check that will one day be edited wrongly.
 */
const RAIL = await page.evaluate(async () => {
  const { RAIL: rail } = await import('/src/lib/theme.js');
  return { width: rail.width, gap: rail.gap };
});

// Something to show, so an indicator is not sitting at zero where a change of
// one step might round to no change at all.
await page.evaluate(() => localStorage.setItem('urdu-games:progress:v1', '40'));

// --- 1. Every game screen carries one ---------------------------------------

step('checking every game carries a rail');
const missing = [];
for (const scene of GAMES) {
  await startScene(page, scene);
  await page.waitForTimeout(200);
  const there = await page.evaluate((name) => {
    const rail = window.__game.scene
      .getScene(name)
      .children.list.find((c) => c.name === 'progress-rail');
    return Boolean(rail && rail.indicator && rail.indicator.drawn);
  }, scene);
  if (!there) missing.push(scene);
}
for (const scene of missing) fail(`${scene} has no rail, or nothing drawn in it`);
if (!missing.length) step(`  ${GAMES.length} games, all with a rail`);

// --- 2. Nothing the child taps is behind it ---------------------------------

step('checking no game draws into the rail');
for (const scene of GAMES) {
  await startScene(page, scene);
  await page.waitForTimeout(400);
  // Interactive objects only, and only ones that *sit* under the panel.
  //
  // Sampled twice, half a second apart, and only what is in the same place both
  // times counts. Fishing's pond runs from x=-140 to past the right edge so its
  // fish enter and leave off-screen, and one caught crossing the strip is not a
  // target a child cannot reach — it is somewhere else a moment later. Checking
  // once flagged whichever fish happened to be there, differently on every run.
  // What must never happen is something coming to *rest* behind the panel.
  const sample = () =>
    page.evaluate(
      ([name, edge]) => {
        const found = [];
        const walk = (list) => {
          for (const item of list) {
            if (item.input?.enabled && item.getBounds) {
              const box = item.getBounds();
              const mine = item.parentContainer?.name === 'progress-rail';
              const home = item.name === 'home-button';
              if (!mine && !home && box.right > 0 && box.left < edge && box.width < 900) {
                found.push(
                  `${item.type} at ${Math.round(box.left)}..${Math.round(box.right)}`
                );
              }
            }
            if (item.list) walk(item.list);
          }
        };
        walk(window.__game.scene.getScene(name).children.list);
        return found;
      },
      [scene, RAIL.width]
    );

  const first = await sample();
  await page.waitForTimeout(500);
  const second = new Set(await sample());
  const intruders = first.filter((entry) => second.has(entry));
  if (intruders.length) {
    fail(
      `${scene}: ${intruders.length} tappable object(s) reach into the rail — ` +
        intruders.slice(0, 3).join(', ')
    );
  }
}
if (!process.exitCode) step(`  nothing tappable crosses x=${RAIL.width}`);

// --- 3. The way out is on top of it -----------------------------------------

step('checking the home button is above the panel');
await startScene(page, 'FindLetter');
await page.waitForTimeout(300);
const buttons = await page.evaluate(() => {
  const scene = window.__game.scene.getScene('FindLetter');
  const rail = scene.children.list.find((c) => c.name === 'progress-rail');
  const home = scene.children.list.find((c) => c.name === 'home-button');
  return home && rail ? { home: home.depth, rail: rail.depth } : null;
});
if (!buttons) fail('no home button on the screen at all');
else if (buttons.home <= buttons.rail) {
  fail(`home is at depth ${buttons.home}, the rail at ${buttons.rail} — it is buried`);
} else step(`  home at ${buttons.home}, rail at ${buttons.rail}`);

// --- 4. Each indicator answers to the total ---------------------------------

for (const id of ['vine', 'tree', 'climber', 'bar', 'glass']) {
  step(`the ${id} moves when the total does`);
  await page.evaluate((which) => {
    localStorage.setItem('urdu-games:indicator', which);
    localStorage.setItem('urdu-games:progress:v1', '40');
  }, id);
  await page.reload();
  await page.waitForFunction(() => window.__game?.scene.isActive('Home'), null, {
    timeout: 30000,
  });
  await startScene(page, 'FindLetter');
  await page.waitForTimeout(500);

  const before = await page.evaluate(
    () =>
      window.__game.scene
        .getScene('FindLetter')
        .children.list.find((c) => c.name === 'progress-rail')?.indicator?.drawn
  );
  if (!before) {
    fail(`${id} drew nothing at all`);
    continue;
  }

  // Two answers, so the change is bigger than a rounding step.
  await page.evaluate(() => {
    window.__progress.award(1);
    window.__progress.award(1);
  });
  const moved = await page
    .waitForFunction(
      (was) =>
        window.__game.scene
          .getScene('FindLetter')
          .children.list.find((c) => c.name === 'progress-rail')?.indicator
          ?.drawn !== was,
      before,
      { timeout: 15000 }
    )
    .then(() => true)
    .catch(() => false);
  if (!moved) fail(`${id} never redrew after two right answers (still ${before})`);
  else step(`  ${before} -> moved`);
}

await finish();
