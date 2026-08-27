/* A first draft of the pen path for each letter. */

import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';
import { launchOptions } from './browser.mjs';
import { CONTENT_DIR, ROOT } from './audio-keys.mjs';
import { fontFingerprint } from './font.mjs';

const OUT_FILE = path.join(CONTENT_DIR, 'strokes.json');

/* The knobs live with the algorithm. */

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

/* Rasterises one glyph and returns its skeleton, in font units. */
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

// Sorted by the alphabet rather than by when each was seeded.
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
