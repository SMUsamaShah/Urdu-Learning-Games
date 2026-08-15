/**
 * A first draft of the pen path for each letter.
 *
 * ## Why this cannot just be read off the glyph
 *
 * content/glyphs.json stores *outlines*: the boundary of the ink. A pen path is
 * a *centreline*, and the two are not the same curve. Nor can the pieces be
 * told apart by counting contours — ص has two because its loop encloses a
 * counter, ٹ has three because of its toe, ت has two for two dots because the
 * pair is drawn as one shape. Only 19 of 38 letters fit "one body plus one
 * contour per dot".
 *
 * So the centreline is recovered the way it always is: rasterise the shape,
 * thin it to one pixel wide, and trace what is left. That is a decent
 * approximation of where a broad nib travelled, and it is the only part of this
 * a machine can do well.
 *
 * ## Why the output is a draft and not an answer
 *
 * Thinning knows nothing about writing. It produces spurious branches at every
 * terminal, it cannot tell which end of a stroke a pen starts from, and where
 * two strokes cross it sees one junction rather than two passes. The ordering
 * below is a rule of thumb — rightmost first, because Urdu is written right to
 * left — and it will be wrong for letters written in an order that is not
 * simply right-to-left.
 *
 * Every one of those needs a person who can write Urdu to fix, which is what
 * tools/trace-studio is for. This gets that person 80% of the way to a path
 * instead of asking them to draw 38 letters from nothing.
 *
 * Existing entries are never touched, so re-running after a correction session
 * is safe. `--force` re-seeds, `--only alif,be` narrows.
 *
 * Usage: node tools/seed-strokes.mjs [--force] [--only alif,be]
 */

import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';
import { launchOptions } from './browser.mjs';
import { CONTENT_DIR, ROOT } from './audio-keys.mjs';
import { fontFingerprint } from './font.mjs';

const OUT_FILE = path.join(CONTENT_DIR, 'strokes.json');

/**
 * The knobs live with the algorithm, in src/lib/skeletonise.js, because the
 * editor puts them on sliders and a copy here would be a second opinion about
 * what the shipped paths were seeded with.
 */

const force = process.argv.includes('--force');
const onlyArg = process.argv.indexOf('--only');
const only = onlyArg > -1 ? new Set(process.argv[onlyArg + 1].split(',')) : null;

const glyphs = JSON.parse(fs.readFileSync(path.join(CONTENT_DIR, 'glyphs.json'), 'utf8'));
const { letters } = JSON.parse(fs.readFileSync(path.join(CONTENT_DIR, 'letters.json'), 'utf8'));

const existing = fs.existsSync(OUT_FILE)
  ? JSON.parse(fs.readFileSync(OUT_FILE, 'utf8'))
  : { letters: {} };

const wanted = letters
  .map((letter) => letter.id)
  .filter((id) => glyphs.letters[id]?.isolated)
  .filter((id) => !only || only.has(id));

const todo = wanted.filter((id) => force || !existing.letters?.[id]);

if (!todo.length) {
  console.log(`Nothing to seed: all ${wanted.length} letters already have strokes.`);
  process.exit(0);
}

const browser = await chromium.launch(launchOptions());
const page = await browser.newPage();

/**
 * Rasterises one glyph and returns its skeleton, in font units.
 *
 * The geometry is src/lib/skeletonise.js — the same module the editor's
 * "Trace again" runs, so what a person tunes on screen and what gets committed
 * here are one implementation rather than two copies that drift.
 *
 * Loaded into the page as a module from a blob URL rather than pasted in as
 * text: that runs the file exactly as written, with no surgery on the source to
 * make it evaluatable, so this cannot quietly diverge from what it imports.
 */
async function loadSkeletoniser() {
  const source = fs.readFileSync(path.join(ROOT, 'src', 'lib', 'skeletonise.js'), 'utf8');
  await page.evaluate(async (text) => {
    const url = URL.createObjectURL(new Blob([text], { type: 'text/javascript' }));
    window.__seed = await import(url);
    URL.revokeObjectURL(url);
  }, source);
}

const skeletonise = (glyph) =>
  page.evaluate((g) => window.__seed.skeletonise(g), { d: glyph.d, bbox: glyph.bbox });

await loadSkeletoniser();

const result = { letters: { ...(existing.letters ?? {}) } };
let dabs = 0;
let drags = 0;

for (const id of todo) {
  const strokes = await skeletonise(glyphs.letters[id].isolated);
  result.letters[id] = { strokes };
  dabs += strokes.filter((s) => s.kind === 'dab').length;
  drags += strokes.filter((s) => s.kind === 'drag').length;
  const shape = strokes.map((s) => (s.kind === 'dab' ? '•' : s.points.length)).join(' ');
  console.log(`  ${id.padEnd(14)} ${strokes.length} stroke(s): ${shape}`);
}

await browser.close();

// Sorted by the alphabet rather than by when each was seeded, so a diff after a
// correction session shows what changed instead of what moved.
const ordered = {};
for (const letter of letters) {
  if (result.letters[letter.id]) ordered[letter.id] = result.letters[letter.id];
}

fs.writeFileSync(
  OUT_FILE,
  `${JSON.stringify(
    {
      $comment: [
        'Pen paths for tracing, in font units, y-down — the same space as the',
        'outlines in glyphs.json, so the game maps a stroke with exactly the',
        'transform it already uses to draw the letter.',
        '',
        'Seeded by tools/seed-strokes.mjs and then corrected by hand in',
        'tools/trace-studio. The seeder cannot know which end a pen starts',
        'from; a person who writes Urdu has to say. Do not re-seed a letter',
        'that has been corrected — the tool will not, unless asked with --force.',
      ],
      upem: glyphs.upem,
      // Which font these paths were drawn against. A centreline belongs to the
      // outlines it came from; see src/lib/strokes.js, which refuses the lot
      // when this stops matching glyphs.json.
      font: fontFingerprint(),
      letters: ordered,
    },
    null,
    2
  )}\n`
);

console.log(
  `\n${todo.length} letter(s) seeded, ${Object.keys(ordered).length} in the file: ` +
    `${drags} strokes to drag, ${dabs} dots to dab.\n` +
    'Every one of these is a guess at stroke order. Fix them: npm run trace-studio'
);
