/**
 * Checks that letters come out one size, and inside the box they were given.
 *
 * Two properties, and both used to be broken:
 *
 *   1. **One em per set.** Every letter in a row, every word on a plate, every
 *      instruction on the ribbon is drawn at one size. Sizing by bounding-box
 *      height instead drew ہ three and a half times the size of ل, and گنتی at
 *      a third the size of جوڑے, because a Nastaliq glyph's box says nothing
 *      about how big the letters inside it are.
 *   2. **Inside the box.** The em is chosen so the most demanding member of the
 *      set fits. Getting that wrong is silent: nothing throws, the letter simply
 *      hangs out over the edge of its card, and only that one letter does — so a
 *      person clicking through the game will not see it.
 *
 * The fitters are checked directly against every glyph in the app rather than
 * through the screens, because the failure is always a specific letter and there
 * are 123 of them. The screens are then walked to make sure they are actually
 * going through the fitters: each texture key carries its role and its em, so a
 * screen drawing one role at two sizes is visible without measuring pixels.
 *
 * Usage: npm run dev &  then  node tools/verify-glyph-sizing.mjs [baseUrl]
 */

import { fail, openApp, startScene, step } from './harness.mjs';

/** Screens to walk, and the scene each one starts from. */
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
  'JoinForms',
  'StartsWith',
  'Trace',
];

const { page, finish } = await openApp({
  name: 'glyph sizing',
  context: { viewport: { width: 1280, height: 720 } },
});

// --- 1. The fitters, against every glyph in the app -------------------------

step('fitting every glyph set into a box');
const fits = await page.evaluate(async () => {
  const { allLetterGlyphs, allNumberGlyphs, allWordGlyphs, loadGlyphs } = await import(
    '/src/lib/content.js'
  );
  // A dynamic import here can land on a separate instance of the module from
  // the one the running game holds, whose outlines would then be unloaded.
  // Loading again is free — content.js caches — and makes this independent of
  // however the dev server happens to resolve the two specifiers.
  await loadGlyphs();
  const { fitEmAlone, fitEmLine, glyphMetrics } = await import('/src/lib/glyph.js');

  // Deliberately awkward boxes: wide and short, tall and narrow, square. A
  // fitter that only ever gets the shapes the app happens to use would hide a
  // bug in whichever of the two constraints is not binding there.
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

        // Placed on the shared baseline, where the glyph's own baseline lands
        // on the box's.
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

      // Maximal, not merely safe: a fitter that returned em 1 would pass
      // everything above. Something in the set has to reach an edge.
      if (widest < w - 1 && tallest < h - 1) {
        problems.push(
          `${name} in ${w}x${h}: fitEmAlone stopped at ${widest.toFixed(0)}x` +
            `${tallest.toFixed(0)}, short of the box in both directions`
        );
      }

      // The shared baseline costs vertical room, so it can never be the larger
      // of the two. If it ever is, the two are measuring the same thing and one
      // of them is wrong.
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

// --- 2. The screens, going through them -------------------------------------

for (const scene of SCENES) {
  await startScene(page, scene);
  // The scenes tween things in; nothing here depends on the tween, but a glyph
  // added on a delay would otherwise be missed.
  await page.waitForFunction(
    (name) => window.__game.scene.getScene(name).children.list.length > 0,
    scene,
    { timeout: 15000 }
  );

  // Every screen has a painted backdrop, and a scene that forgets to queue it
  // in `preload` falls back to the drawn meadow — quietly, because the fallback
  // is meant to be invisible. This walk is already visiting every screen, so it
  // is the cheapest place to notice.
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

  const drawn = await page.evaluate((name) => {
    const scene = window.__game.scene.getScene(name);

    /** Every glyph image on the screen, whatever it is nested inside. */
    const found = [];
    const walk = (list) => {
      for (const child of list) {
        if (child.list) walk(child.list);
        const key = child.texture?.key;
        // Keys are written `<role>:em<N>:<id>`, where the role is the place on
        // the screen rather than the kind of glyph — a letter in the strip and
        // the same letter on the flashcard are two roles, fitted to two boxes,
        // and only glyphs sharing a role have to share a size. Anything still
        // sized by its bounding box has no em in its key and is skipped.
        // `em(\d+)` deliberately will not match `emNaN`. A scene that used
        // fitEmAlone's return object as a number instead of destructuring
        // `.em` off it drew every letter at one wrong size — consistently, so
        // the one-size-per-role check below was perfectly happy. Broken keys
        // are collected separately and failed on.
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
  }, scene);

  for (const key of drawn.broken) {
    fail(`${scene}: "${key}" — that em is not a number, so the letter is drawn at whatever size Phaser fell back to`);
  }

  if (!drawn.roles.length) fail(`${scene}: no em-sized writing found at all`);
  const mixed = drawn.roles.filter((d) => d.ems.length > 1);
  for (const { role, ems } of mixed) {
    fail(`${scene}: "${role}" is drawn at ${ems.length} different sizes (${ems.join(', ')})`);
  }
  step(
    `${scene}: ${drawn.roles.length} role(s) of writing, ` +
      (mixed.length ? `${mixed.length} at mixed sizes` : 'each at one size')
  );
}

await finish();
