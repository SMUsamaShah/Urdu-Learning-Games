/* Checks the strip down the left of every game screen. */

import { fail, openApp, startScene, step } from './harness.mjs';

/* Every game. */
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
  'BuildWord',
  'FillLetter',
  'JoinWord',
  'Trace',
];

const { page, finish } = await openApp({ name: 'rail' });

/* The rail's width, read from the app. */
const RAIL = await page.evaluate(async () => {
  const { RAIL: rail } = await import('/src/lib/theme.js');
  return { width: rail.width, gap: rail.gap };
});

// Something to show, so an indicator is not sitting at zero where a change of one step might round to no change at all.
await page.evaluate(() => localStorage.setItem('urdu-games:progress:v1', '40'));

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

step('checking no game draws into the rail');
for (const scene of GAMES) {
  await startScene(page, scene);
  await page.waitForTimeout(400);
  // Interactive objects only, and only ones that *sit* under the panel.
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
