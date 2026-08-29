/* What a game is allowed to deal. */

import { fail, homeIsUp, openApp, startScene, step } from './harness.mjs';

/* Must match src/lib/enabled.js. */
const BAND_KEY = 'urdu-games:numbers-band';
const OFF_KEY = 'urdu-games:disabled';

/* The screens that deal numbers. */
const NUMBER_SCREENS = ['Numbers', 'NumberLine'];

/* Every screen that can put a letter in front of a child. */
const LETTER_SCREENS = [
  'Flashcards',
  'FindLetter',
  'Balloons',
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
  'Hidden',
  'Bounce',
  'BuildWord',
  'FillLetter',
  'JoinWord',
  'Trace',
];

/* A letter with a word and a picture, so it can reach every screen. */
const VICTIM = 'be';

// Twenty-one screens dealt three times each.
const { page, finish, url } = await openApp({
  name: 'content',
  open: false,
  waitForHome: false,
  timeoutMs: 900000,
});

/* Sets the band and reloads, so every module reads it fresh. */
async function band(value) {
  await page.evaluate(
    ([key, v]) => localStorage.setItem(key, String(v)),
    [BAND_KEY, value]
  );
  await page.reload({ waitUntil: 'domcontentloaded' });
  await homeIsUp(page);
  await page.waitForTimeout(400);
}

/* Every number the app believes is currently in play. */
const inPlay = () =>
  page.evaluate(async () => {
    const content = await import('/src/lib/content.js');
    return content.activeNumbers().map((n) => n.value);
  });

await page.goto(url, { waitUntil: 'domcontentloaded' });
await homeIsUp(page);

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

step('the number screens deal only what is in play');
for (const limit of [10, 100]) {
  await band(limit);
  for (const scene of NUMBER_SCREENS) {
    await startScene(page, scene);
    await page.waitForTimeout(700);

    // Rounds are dealt from a pool.
    const seen = new Set();
    for (let round = 0; round < 6; round++) {
      const values = await page.evaluate(
        (name) => {
          const scene = window.__game.scene.getScene(name);
          const ids = new Set();
          // Whatever the screen is holding: the quiz games keep a pool and a target, the caterpillar keeps a run and a tray.
          for (const key of ['countable', 'run', 'tray', 'pool']) {
            // Only inspect array-valued scene state.
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

step(`switching ${VICTIM} off`);
await band(10);
await page.evaluate(
  ([key, id]) => localStorage.setItem(key, JSON.stringify({ letter: [id], word: [], number: [] })),
  [OFF_KEY, VICTIM]
);
await page.reload({ waitUntil: 'domcontentloaded' });
await homeIsUp(page);
await page.waitForTimeout(400);

const stillThere = await page.evaluate(async (id) => {
  const content = await import('/src/lib/content.js');
  return {
    letters: content.activeLetters().some((l) => l.id === id),
    sequence: content.sequenceFor('alphabetical').includes(id),
    families: content.letters.some((l) => content.shapeFamilySiblings(l.id).includes(id)),
  };
}, VICTIM);
for (const [where, found] of Object.entries(stillThere)) {
  if (found) fail(`${VICTIM} is switched off but still turns up in ${where}`);
}
if (!Object.values(stillThere).some(Boolean)) step('  gone from the letters, the sequence and the families');

step('and no screen deals it');
const dealt = [];
for (const scene of LETTER_SCREENS) {
  await startScene(page, scene);
  await page.waitForTimeout(500);

  // The pools *and* what is on screen, in one visit.
  const found = await page.evaluate(
    ([name, id]) => {
      const scene = window.__game.scene.getScene(name);
      const ids = new Set();
      const collect = (held) => {
        // Arrays, and Maps of arrays: OddOne keeps its letters grouped by shape family in a Map, and reading only the arrays.
        if (held instanceof Map) return held.forEach(collect);
        if (!Array.isArray(held)) return;
        for (const item of held) {
          if (typeof item === 'string') ids.add(item);
          else if (item?.letterId) ids.add(item.letterId);
          else if (item?.id) ids.add(item.id);
        }
      };
      for (const key of [
        'pool',
        'sequence',
        'run',
        'tray',
        'letters',
        // The spelling screens: the word being spelled, and the row of slots it is being spelled into.
        'slots',
        'cards',
        'balls',
        'byFamily',
        'lineUp',
        // Shape-family ids are names, not letter arrays.
      ]) {
        collect(scene[key]);
      }
      if (scene.target) ids.add(scene.target);
      if (scene.letterId) ids.add(scene.letterId);
      for (const tile of scene.choicesLayer?.list ?? []) {
        if (tile.choiceId) ids.add(tile.choiceId);
      }
      return ids.has(id);
    },
    [scene, VICTIM]
  );
  if (found) dealt.push(scene);
}
if (dealt.length) fail(`${VICTIM} is switched off and ${dealt.join(', ')} still hold it`);
else step(`  ${LETTER_SCREENS.length} screens, none of them holding it`);

step('switching almost everything off');
const survivors = await page.evaluate(async () => {
  const content = await import('/src/lib/content.js');
  const keep = content.letters.slice(0, 2).map((l) => l.id);
  const off = content.letters.map((l) => l.id).filter((id) => !keep.includes(id));
  localStorage.setItem(
    'urdu-games:disabled',
    JSON.stringify({ letter: off, word: [], number: [] })
  );
  return off.length;
});
await page.reload({ waitUntil: 'domcontentloaded' });
await homeIsUp(page);
await page.waitForTimeout(400);
const fellBack = await page.evaluate(async () => {
  const content = await import('/src/lib/content.js');
  return content.activeLetters().length;
});
if (fellBack < 10) {
  fail(`${survivors} letters off left only ${fellBack} in play — it should have fallen back`);
} else step(`  ${survivors} off, and it fell back to all ${fellBack}`);

for (const scene of ['FindLetter', 'Memory', 'Caterpillar']) {
  await startScene(page, scene);
  await page.waitForTimeout(700);
  const dealtAny = await page.evaluate((name) => {
    const scene = window.__game.scene.getScene(name);
    return Boolean(
      scene.target ||
        scene.choicesLayer?.list?.length ||
        scene.cards?.length ||
        scene.run?.length
    );
  }, scene);
  if (!dealtAny) fail(`${scene} dealt nothing with almost every letter switched off`);
}
if (!process.exitCode) step('  and the games still deal a round');

await finish();
