/* Checks that letters come out one size, and inside the box they were given. */

import { fail, openApp, startScene, step } from './harness.mjs';

/* Screens to walk, and the scene each one starts from. */
const SCENES = [
  'Home',
  'Flashcards',
  'FindLetter',
  'Balloons',
  'WordPictures',
  'Numbers',
  'Memory',
  'Sequence',
  'Doors',
  'TapAll',
  'Caterpillar',
  'LetterPuzzle',
  'Fishing',
  'Baskets',
  'Whack',
  'OddOne',
  'InOrder',
  'ConnectPairs',
  'NumberLine',
  'Hidden',
  'Bounce',
  'BuildWord',
  'FillLetter',
  'JoinWord',
  'JoinForms',
  'StartsWith',
  'Trace',
];

const { page, finish } = await openApp({
  name: 'glyph sizing',
  context: { viewport: { width: 1280, height: 720 } },
});

step('fitting every glyph set into a box');
const fits = await page.evaluate(async () => {
  const { allLetterGlyphs, allNumberGlyphs, allWordGlyphs, loadGlyphs } = await import(
    '/src/lib/content.js'
  );
  // A dynamic import here can land on a separate instance of the module from the one the running game holds.
  await loadGlyphs();
  const { fitEmAlone, fitEmLine, glyphMetrics } = await import('/src/lib/glyph.js');

  // Deliberately awkward boxes: wide and short, tall and narrow, square.
  const BOXES = [
    [420, 140],
    [120, 120],
    [90, 260],
    [300, 60],
  ];

  const sets = {
    'letters (isolated)': allLetterGlyphs('isolated'),
    'letters (all forms)': allLetterGlyphs(),
    numbers: allNumberGlyphs(),
    words: allWordGlyphs(),
  };

  const problems = [];
  const summary = [];
  // A pixel of slack: the em is a float and the metrics round through it.
  const EPS = 0.01;

  for (const [name, glyphs] of Object.entries(sets)) {
    if (!glyphs.length) {
      problems.push(`${name}: empty set — the glyphs did not load`);
      continue;
    }

    for (const [w, h] of BOXES) {
      const alone = fitEmAlone(glyphs, w, h);
      const line = fitEmLine(glyphs, w, h);
      let widest = 0;
      let tallest = 0;
      let lineTop = Infinity;
      let lineBottom = -Infinity;

      for (const glyph of glyphs) {
        const a = glyphMetrics(glyph, alone.em);
        if (a.width > w + EPS || a.height > h + EPS) {
          problems.push(
            `${name} in ${w}x${h}: fitEmAlone left a glyph ` +
              `${a.width.toFixed(1)}x${a.height.toFixed(1)}, outside the box`
          );
        }
        widest = Math.max(widest, a.width);
        tallest = Math.max(tallest, a.height);

        // Placed on the shared baseline, where the glyph's own baseline lands on the box's.
        const l = glyphMetrics(glyph, line.em);
        const top = line.baseline - l.baseline;
        if (l.width > w + EPS || top < -EPS || top + l.height > h + EPS) {
          problems.push(
            `${name} in ${w}x${h}: fitEmLine put a glyph at ${top.toFixed(1)}..` +
              `${(top + l.height).toFixed(1)}, outside the box`
          );
        }
        lineTop = Math.min(lineTop, top);
        lineBottom = Math.max(lineBottom, top + l.height);
      }

      // Maximal, not merely safe: a fitter that returned em 1 would pass everything above.
      if (widest < w - 1 && tallest < h - 1) {
        problems.push(
          `${name} in ${w}x${h}: fitEmAlone stopped at ${widest.toFixed(0)}x` +
            `${tallest.toFixed(0)}, short of the box in both directions`
        );
      }

      // The shared baseline costs vertical room, so it can never be the larger of the two.
      if (line.em > alone.em + EPS) {
        problems.push(
          `${name} in ${w}x${h}: fitEmLine returned a larger em (${line.em.toFixed(1)}) ` +
            `than fitEmAlone (${alone.em.toFixed(1)})`
        );
      }

      summary.push({
        name,
        box: `${w}x${h}`,
        alone: alone.em,
        line: line.em,
        lineSpan: lineBottom - lineTop,
      });
    }
  }

  return { problems, summary };
});

for (const problem of fits.problems) fail(problem);
if (!fits.problems.length) {
  const worst = fits.summary.reduce((a, b) => (a.line / a.alone < b.line / b.alone ? a : b));
  step(
    `${fits.summary.length} set/box combinations fit, none overflowing; a shared ` +
      `baseline costs at most ${(100 - (worst.line / worst.alone) * 100).toFixed(0)}% ` +
      `of the size (${worst.name} in ${worst.box})`
  );
}

for (const scene of SCENES) {
  await startScene(page, scene);
  // The scenes tween things in; nothing here depends on the tween, but a glyph added on a delay would otherwise be missed.
  await page.waitForFunction(
    (name) => window.__game.scene.getScene(name).children.list.length > 0,
    scene,
    { timeout: 15000 }
  );

  // Every screen has a painted backdrop.
  const backdrop = await page.evaluate((name) => {
    const scene = window.__game.scene.getScene(name);
    const wanted = `backdrop:${name}`;
    const found = scene.children.list.some((child) =>
      child.list?.some((c) => c.texture?.key === wanted)
    );
    return { known: scene.textures.exists(wanted), found };
  }, scene);
  if (!backdrop.known) fail(`${scene}: its backdrop was never loaded — is it queued in preload()?`);
  else if (!backdrop.found) fail(`${scene}: backdrop loaded but the screen is not using it`);

  await checkWriting(scene, scene);
}

/* Every role of writing on a screen, each at exactly one size. */
async function checkWriting(where, sceneKey) {
  const drawn = await page.evaluate((name) => {
    const scene = window.__game.scene.getScene(name);

    /* Every glyph image on the screen, whatever it is nested inside. */
    const found = [];
    const walk = (list) => {
      for (const child of list) {
        if (child.list) walk(child.list);
        const key = child.texture?.key;
        // Keys are written `<role>.
        const match = typeof key === 'string' && key.match(/^([\w-]+):em([\w.]+):/);
        if (match) found.push({ role: match[1], em: Number(match[2]), raw: match[2] });
      }
    };
    walk(scene.children.list);

    const byRole = {};
    for (const { role, em } of found) (byRole[role] ??= new Set()).add(em);
    return {
      roles: Object.entries(byRole).map(([role, ems]) => ({ role, ems: [...ems] })),
      broken: [...new Set(found.filter((f) => !Number.isFinite(f.em)).map((f) => `${f.role}:em${f.raw}`))],
    };
  }, sceneKey);

  for (const key of drawn.broken) {
    fail(`${where}: "${key}" — that em is not a number, so the letter is drawn at whatever size Phaser fell back to`);
  }

  if (!drawn.roles.length) fail(`${where}: no em-sized writing found at all`);
  const mixed = drawn.roles.filter((d) => d.ems.length > 1);
  for (const { role, ems } of mixed) {
    fail(`${where}: "${role}" is drawn at ${ems.length} different sizes (${ems.join(', ')})`);
  }
  step(
    `${where}: ${drawn.roles.length} role(s) of writing, ` +
      (mixed.length ? `${mixed.length} at mixed sizes` : 'each at one size')
  );
}

// Every page of the menu.
await startScene(page, 'Home');
await page.waitForTimeout(600);
const pageCount = await page.evaluate(
  () => window.__game.scene.getScene('Home').pages?.length ?? 0
);
if (pageCount < 2) fail(`the menu has ${pageCount} page(s), so its pages cannot be compared`);
for (let index = 0; index < pageCount; index++) {
  if (index) {
    const turned = await page.evaluate(() => {
      const home = window.__game.scene.getScene('Home');
      const was = home.page;
      home.turnPage(1);
      return { was, now: home.page };
    });
    // Without this the check below would happily measure page one twice.
    if (turned.now === turned.was) fail('turnPage did not turn the page');
    await page.waitForTimeout(700);
  }
  await checkWriting(`the menu, page ${index + 1}`, 'Home');
}

await finish();
