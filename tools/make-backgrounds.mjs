/**
 * Draws a backdrop for each screen.
 *
 * Every screen used to share one painted meadow. That is fine and it is also
 * why the app feels like one room: the reference apps give each activity its
 * own place — a beach, a forest, a riverbank — and moving between them is a
 * large part of why they feel like a set of games rather than one game with
 * eight modes. A three-year-old cannot read the title on the ribbon; the
 * background is how they know where they are.
 *
 * ## What makes a usable backdrop here, which is not what makes a nice picture
 *
 * These sit *underneath* Nastaliq letters, answer tiles and a spider. Almost
 * everything that makes a landscape illustration good makes it a bad backdrop:
 *
 *   - **Nothing in the middle.** The middle band is where the letters go. The
 *     interest belongs at the edges and along the bottom.
 *   - **Quiet, and light.** Low contrast, no dark masses, no busy texture. A
 *     glyph is a thin black outline; anything detailed behind it wins.
 *   - **No text.** Image models put lettering into children's illustrations
 *     unprompted, and Latin letters on a screen teaching the Urdu alphabet are
 *     worse than no picture at all. Checked for below, not just asked for.
 *
 * ## Cost and repeatability
 *
 * Generated once and committed, like the word pictures. Not run at build time:
 * it costs money, needs a key, and which of these is any good is a judgement
 * somebody has to make by looking. Raw PNGs are cached in .image-cache/bg/, so
 * re-running to retune the crop or the compression is free.
 *
 * Usage:
 *   OPENAI_API_KEY=... node tools/make-backgrounds.mjs [--force] [--only home,trace]
 *
 * The key is only ever read from the environment. Do not put it in a file.
 */

import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';
import { launchOptions } from './browser.mjs';
import { CONTENT_DIR, ROOT } from './audio-keys.mjs';

const OUT = path.join(ROOT, 'public', 'images', 'backgrounds');
const RAW = path.join(ROOT, '.image-cache', 'bg');
const MODEL = 'gpt-image-2';
/** The widest the model offers. Cropped to 16:9 below. */
const SIZE = '1536x1024';
/** The design surface is 1280x720; this is that at 1x, which is enough. */
const TARGET = { width: 1280, height: 720 };
const CONCURRENCY = 3;

/**
 * The house style, on every prompt.
 *
 * Written as one illustrator's brief rather than a list of tags, because the
 * whole point is that eleven pictures look like a set. The "empty middle"
 * instruction is repeated in different words on purpose: it is the one that
 * matters most and the one the model most wants to ignore.
 */
const STYLE =
  'Soft flat vector illustration for a toddler picture book, wide landscape. ' +
  'Gentle pastel colours, pale blue sky, no dark areas, low contrast, ' +
  'simple bold shapes with soft edges, no fine texture, no gradients on small ' +
  'details. Scenery only, no characters, no people, no animals. ' +
  'The entire middle of the image is empty open sky or plain flat ground — ' +
  'all scenery sits along the bottom edge and the far left and right edges, ' +
  'leaving a large clear calm space through the centre. ' +
  'Absolutely no text, no letters, no numbers, no writing, no signs, no logos.';

/**
 * One per screen, keyed by scene.
 *
 * The brief for each is a place, not a mood: "a beach" gives something usable,
 * "cheerful and fun" gives whatever the model felt like. Where a screen draws
 * something large over the backdrop, the brief says so.
 */
const BACKDROPS = {
  Home: 'A sunny green meadow with rolling hills far behind, a few small ' +
    'flowers along the very bottom edge, and a tree at each far side.',
  Flashcards:
    'A calm garden on a bright day: a low hedge and a few tulips along the ' +
    'bottom edge only, pale sky filling everything above. Very plain, since a ' +
    'row of cards covers the bottom of this screen.',
  FindLetter:
    'A green meadow with soft rolling hills and scattered daisies along the ' +
    'bottom, a wide pale sky above.',
  Balloons:
    'A high open sky seen from above the clouds: pale blue, a few soft white ' +
    'cloud banks along the very bottom edge only, nothing else at all.',
  WordPictures:
    'A fruit orchard: neat rounded trees along the far left and far right ' +
    'edges, green grass along the bottom, wide open sky between them.',
  Numbers:
    'A calm seaside: pale sand along the bottom, flat turquoise sea behind it, ' +
    'a couple of small rounded rocks at the far edges, wide sky above.',
  Memory:
    'A forest clearing: rounded leafy trees along the far left and right ' +
    'edges, soft green grass along the bottom, bright empty sky in the middle.',
  Sequence:
    'A gentle riverbank: a winding pale blue river across the bottom, green ' +
    'banks with reeds at the far edges, wide open sky above.',
  JoinForms:
    'A soft hillside on a clear day with a pale rainbow arcing across the far ' +
    'left and right edges only, green grass along the bottom, empty sky in ' +
    'the middle.',
  StartsWith:
    'A tidy farm field: a low wooden fence along the bottom edge, a red barn ' +
    'small and far off at the left edge, green field and wide open sky.',
  Doors:
    'A quiet village lane: a low garden wall and a hedge along the bottom ' +
    'edge, one small cottage roof far away at the left edge, wide open sky.',
  TapAll:
    'A tidy park lawn: a neat hedge and a row of small round bushes along the ' +
    'bottom edge, one lamp post at the far right edge, wide pale sky.',
  Caterpillar:
    'A leafy garden hedge running along the bottom edge with a few round ' +
    'bushes, one tall sunflower at the far right edge, wide pale sky above.',
  LetterPuzzle:
    'A plain playroom floor seen flat on: a soft cream wall filling most of ' +
    'the picture, a pale wooden floor strip along the bottom edge, one potted ' +
    'plant at the far left edge. Very quiet — a large letter is built over ' +
    'the middle of this screen.',
  Trace:
    'An almost empty pale blue sky with the faintest suggestion of two soft ' +
    'clouds at the top corners and a thin strip of green grass along the very ' +
    'bottom. Nearly featureless — a large letter is drawn over the middle of ' +
    'this screen.',
};

const key = process.env.OPENAI_API_KEY;
if (!key) {
  console.error('Set OPENAI_API_KEY. It is never read from a file.');
  process.exit(1);
}

const force = process.argv.includes('--force');
const onlyArg = process.argv.indexOf('--only');
const only = onlyArg > -1 ? new Set(process.argv[onlyArg + 1].split(',')) : null;

const wanted = Object.keys(BACKDROPS).filter((name) => !only || only.has(name));

fs.mkdirSync(OUT, { recursive: true });
fs.mkdirSync(RAW, { recursive: true });

const todo = wanted.filter(
  (name) => force || !fs.existsSync(path.join(RAW, `${name}.png`))
);

if (todo.length === 0) {
  console.log('Every backdrop is already drawn; re-cropping from the cache.');
} else {
  console.log(`Drawing ${todo.length} of ${wanted.length} backdrops with ${MODEL} (low quality).`);
}

let spentTokens = 0;
const failed = [];

async function generate(name) {
  const rawFile = path.join(RAW, `${name}.png`);
  if (!force && fs.existsSync(rawFile)) return;

  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const response = await fetch('https://api.openai.com/v1/images/generations', {
        method: 'POST',
        headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' },
        body: JSON.stringify({
          model: MODEL,
          prompt: `${BACKDROPS[name]} ${STYLE}`,
          size: SIZE,
          quality: 'low',
          n: 1,
        }),
      });

      if (!response.ok) {
        const body = await response.text();
        // Rate limits are worth waiting out; anything else is not.
        if (response.status === 429 && attempt < 3) {
          await new Promise((r) => setTimeout(r, attempt * 8000));
          continue;
        }
        throw new Error(`${response.status}: ${body.slice(0, 160)}`);
      }

      const data = await response.json();
      spentTokens += data.usage?.output_tokens ?? 0;
      fs.writeFileSync(rawFile, Buffer.from(data.data[0].b64_json, 'base64'));
      return;
    } catch (error) {
      if (attempt === 3) throw error;
      await new Promise((r) => setTimeout(r, attempt * 4000));
    }
  }
}

/** Runs `worker` over `items`, `limit` at a time. */
async function pool(items, limit, worker) {
  const queue = [...items];
  let done = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, queue.length) }, async () => {
      while (queue.length) {
        const item = queue.shift();
        try {
          await worker(item);
          console.log(`  ${++done}/${items.length} ${item}`);
        } catch (error) {
          failed.push(item);
          console.error(`  FAILED ${item}: ${error.message}`);
        }
      }
    })
  );
}

await pool(todo, CONCURRENCY, generate);

// ------------------------------------------------------------ crop and pack
//
// A browser, for the same reason cutout.mjs uses one: it has a good image
// decoder, a good scaler and a WebP encoder, and depending on one of those from
// npm to resize eleven pictures is not a trade worth making.
//
// Cropped rather than squashed. The model's widest is 3:2 and the app is 16:9,
// so about an eighth of the height goes. Taken off the top, because these are
// landscapes: the bottom edge carries the grass and the hedges, and the top is
// the part that is meant to be empty anyway.

console.log('Cropping to 16:9 and packing…');
const browser = await chromium.launch(launchOptions());
const page = await browser.newPage();

/** @returns {Promise<{webp: Buffer, ink: number}>} */
async function pack(png) {
  const result = await page.evaluate(
    async ([base64, width, height]) => {
      const image = new Image();
      image.src = `data:image/png;base64,${base64}`;
      await image.decode();

      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');

      // Fill the frame, keeping the bottom edge and losing height off the top.
      const scale = width / image.width;
      ctx.drawImage(
        image,
        0,
        height - image.height * scale,
        width,
        image.height * scale
      );

      // How much of this is dark. A backdrop is meant to be pale — a dark one
      // will swallow the black glyphs drawn over it, and it is far cheaper to
      // notice that here than by squinting at a screenshot.
      const { data } = ctx.getImageData(0, 0, width, height);
      let dark = 0;
      for (let i = 0; i < data.length; i += 4) {
        if ((data[i] + data[i + 1] + data[i + 2]) / 3 < 110) dark++;
      }

      const blob = await new Promise((r) => canvas.toBlob(r, 'image/webp', 0.82));
      const buffer = new Uint8Array(await blob.arrayBuffer());
      return { webp: [...buffer], ink: dark / (data.length / 4) };
    },
    [png.toString('base64'), TARGET.width, TARGET.height]
  );
  return { webp: Buffer.from(result.webp), ink: result.ink };
}

let totalBytes = 0;
const written = [];
for (const name of wanted) {
  const rawFile = path.join(RAW, `${name}.png`);
  if (!fs.existsSync(rawFile)) continue;

  const { webp, ink } = await pack(fs.readFileSync(rawFile));
  // Anything above a few per cent means a dark mass somewhere — a night sky, a
  // heavy tree line, a shadow across the ground — and a Nastaliq outline drawn
  // over that is unreadable.
  if (ink > 0.06) {
    console.warn(
      `  ! ${name}: ${(ink * 100).toFixed(1)}% of it is dark — letters may not read over this`
    );
  }
  fs.writeFileSync(path.join(OUT, `${name}.webp`), webp);
  totalBytes += webp.length;
  written.push(name);
  console.log(`  ${name}: ${(webp.length / 1024).toFixed(0)} KB, ${(ink * 100).toFixed(1)}% dark`);
}
await browser.close();

// Every backdrop on disk, not only the ones this run touched. Built from
// `written` once, and `--only Doors` then rewrote the manifest with two entries
// and dropped the other eleven — every screen fell back to the drawn meadow,
// which is exactly the silent failure the fallback is designed to hide.
// verify:sizing caught it; it should never have been possible.
const manifest = {
  $comment: 'Generated by tools/make-backgrounds.mjs. Do not edit by hand.',
  model: MODEL,
  width: TARGET.width,
  height: TARGET.height,
  scenes: Object.fromEntries(
    Object.keys(BACKDROPS)
      .filter((name) => fs.existsSync(path.join(OUT, `${name}.webp`)))
      .map((name) => [name, `images/backgrounds/${name}.webp`])
  ),
};
fs.writeFileSync(
  path.join(CONTENT_DIR, 'backgrounds.json'),
  JSON.stringify(manifest, null, 0)
);

console.log(
  `\n${written.length} backdrops, ${(totalBytes / 1024).toFixed(0)} KB total, ` +
    `${spentTokens} image tokens used.`
);
if (failed.length) {
  console.error(`Failed: ${failed.join(', ')}. Re-run to retry only those.`);
  process.exitCode = 1;
}
