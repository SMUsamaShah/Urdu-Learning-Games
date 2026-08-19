/**
 * What a game is allowed to deal.
 *
 * Two settings decide it — how high the numbers go, and which individual
 * letters, words and numbers a parent has switched off — and both have the same
 * failure mode: the setting is stored correctly, Settings shows it correctly,
 * and one game somewhere reads the raw content file and deals the thing anyway.
 * That is invisible until a child meets ۹۹ in a matching game, so it is checked
 * from the outside, by dealing rounds and looking at what came up.
 *
 * The band is the part that exists today; the per-item switches follow.
 *
 * Usage: npm run dev &  then  node tools/verify-content-toggles.mjs [baseUrl]
 */

import { fail, homeIsUp, openApp, startScene, step } from './harness.mjs';

/** Must match BANDS in src/lib/enabled.js. */
const BAND_KEY = 'urdu-games:numbers-band';

/** The screens that deal numbers. */
const NUMBER_SCREENS = ['Numbers', 'NumberLine'];

const { page, finish, url } = await openApp({ name: 'content', open: false, waitForHome: false });

/** Sets the band and reloads, so every module reads it fresh. */
async function band(value) {
  await page.evaluate(
    ([key, v]) => localStorage.setItem(key, String(v)),
    [BAND_KEY, value]
  );
  await page.reload({ waitUntil: 'domcontentloaded' });
  await homeIsUp(page);
  await page.waitForTimeout(400);
}

/** Every number the app believes is currently in play. */
const inPlay = () =>
  page.evaluate(async () => {
    const content = await import('/src/lib/content.js');
    return content.activeNumbers().map((n) => n.value);
  });

await page.goto(url, { waitUntil: 'domcontentloaded' });
await homeIsUp(page);

// --- 1. The band decides what is in play ------------------------------------

step('the band narrows what is in play');
for (const limit of [10, 20]) {
  await band(limit);
  const values = await inPlay();
  const over = values.filter((v) => v > limit);
  if (over.length) fail(`with the band at ${limit}, ${over.join()} are still in play`);
  else if (!values.includes(limit)) fail(`the band is ${limit} but ${limit} itself is not in play`);
  else step(`  ${limit}: ${values.length} numbers, up to ${Math.max(...values)}`);
}

// A thousand and a lakh come in with the hundred and not before.
await band(20);
if ((await inPlay()).includes(1000)) fail('a thousand is in play at a band of twenty');
await band(100);
const wide = await inPlay();
if (!wide.includes(1000) || !wide.includes(100000)) {
  fail('the hundred band leaves out the thousand or the lakh');
} else step('  a thousand and a lakh arrive with the hundred');

// --- 2. And the screens honour it -------------------------------------------
//
// Not the same question. `activeNumbers()` can be perfectly correct while a
// screen imports the raw `numbers` array and deals from that, which is exactly
// the mistake this is here to catch.

step('the number screens deal only what is in play');
for (const limit of [10, 100]) {
  await band(limit);
  for (const scene of NUMBER_SCREENS) {
    await startScene(page, scene);
    await page.waitForTimeout(700);

    // Rounds are dealt from a pool, so one round proves little; this deals
    // several and looks at everything that came up across all of them.
    const seen = new Set();
    for (let round = 0; round < 6; round++) {
      const values = await page.evaluate(
        (name) => {
          const scene = window.__game.scene.getScene(name);
          const ids = new Set();
          // Whatever the screen is holding: the quiz games keep a pool and a
          // target, the caterpillar keeps a run and a tray.
          for (const key of ['countable', 'run', 'tray', 'pool']) {
            // Guarded: these are arrays on the screens that have them and
            // something else entirely on the screens that happen to use the
            // same word for another thing.
            if (Array.isArray(scene[key])) for (const id of scene[key]) ids.add(id);
          }
          if (scene.target) ids.add(scene.target);
          for (const tile of scene.choicesLayer?.list ?? []) {
            if (tile.choiceId) ids.add(tile.choiceId);
          }
          return [...ids]
            .filter((id) => typeof id === 'string' && id.startsWith('n'))
            .map((id) => Number(id.slice(1)))
            .filter((v) => Number.isFinite(v));
        },
        scene
      );
      for (const value of values) seen.add(value);
      await page.evaluate((name) => window.__game.scene.getScene(name).nextRound?.(), scene);
      await page.waitForTimeout(400);
    }

    const over = [...seen].filter((v) => v > limit);
    if (over.length) fail(`${scene} dealt ${over.join()} with the band at ${limit}`);
    else if (!seen.size) fail(`${scene} dealt no numbers at all — the check saw nothing`);
    else step(`  ${scene} at ${limit}: ${seen.size} distinct, highest ${Math.max(...seen)}`);
  }
}

await finish();
