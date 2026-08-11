/**
 * Draws every word in content/words.json.
 *
 * A wall of letterforms is not interesting to a three-year-old. The words are
 * all concrete nouns chosen to teach a letter — a goat, a kite, an apple — so a
 * picture is what makes them mean anything before the child can read.
 *
 * Images are generated once and committed. This is not run at build time: it
 * costs money, needs a key, and the output is a design decision somebody should
 * look at before it ships.
 *
 * gpt-image-2 cannot produce a transparent background, so the white one it does
 * produce is removed here — see cutout() below for why that is safe on these
 * particular images and would not be in general.
 *
 * Usage:
 *   OPENAI_API_KEY=... node tools/make-word-images.mjs [--force] [--only id,id]
 *
 * Re-running is cheap: raw PNGs are cached in .image-cache/, so only words with
 * no picture yet cost anything, and the cutout runs again over everything. That
 * is deliberate — it means the keying can be tuned without paying to redraw.
 *
 * The key is only ever read from the environment. Do not put it in a file.
 */

import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';
import { launchOptions } from './browser.mjs';
import { CONTENT_DIR, ROOT, readContent } from './audio-keys.mjs';

const OUT = path.join(ROOT, 'public', 'images', 'words');
const RAW = path.join(ROOT, '.image-cache');
const MODEL = 'gpt-image-2';
const SIZE = 1024;
/** Displayed at roughly 190px, so this stays crisp on a 2x screen. */
const TARGET = 384;
const CONCURRENCY = 4;

const key = process.env.OPENAI_API_KEY;
if (!key) {
  console.error('Set OPENAI_API_KEY. It is never read from a file.');
  process.exit(1);
}

const force = process.argv.includes('--force');
const onlyArg = process.argv.indexOf('--only');
const only = onlyArg > -1 ? new Set(process.argv[onlyArg + 1].split(',')) : null;

const STYLE =
  'flat vector illustration for a toddler picture book, simple bold shapes, ' +
  'thick clean outlines, bright cheerful colours, one single object centred, ' +
  'plain solid white background, no text, no letters, no numbers, no shadows';

/**
 * Subjects the English gloss alone would get wrong. The gloss is a translation,
 * not an art brief: "fruit" gives a generic fruit bowl where the word is about
 * fruit on a tree, and "halwa" means nothing to the model without context.
 */
const OVERRIDES = {
  halwa: 'a bowl of halwa, an orange South Asian semolina sweet, garnished with nuts',
  samar: 'a cluster of ripe fruit hanging on a leafy branch',
  zhaala: 'white hailstones falling from a small grey cloud',
  wardi: "a child's school uniform, shirt and shorts on a hanger",
  chaaye: 'a steaming cup of milky chai tea in a small cup and saucer',
  roti: 'a round flatbread roti on a plate',
  dabba: 'a simple closed cardboard box',
  topi: 'a colourful child cap with a peak',
  ainak: 'a pair of round eyeglasses',
  gaari: 'a small cheerful toy car seen from the side',
  patang: 'a diamond kite with a tail, flying',
  naak: 'a friendly cartoon face showing a prominent nose',
  qalam: 'a single pen at a slight angle',
  saabun: 'a bar of soap with a few bubbles',
  jahaaz: 'a passenger aeroplane flying',
  ghubara: 'a single bright party balloon on a string',
  footbal: 'a classic black and white football',
  zaroof: 'a neat stack of colourful plates with a teacup and a bowl beside it',
  kaaghaz: 'a single clean sheet of white paper with one folded corner',
  hauz: 'a small round garden pond of blue water with a stone rim',
};

const words = readContent('words.json').words.filter(
  (w) => !only || only.has(w.id)
);

fs.mkdirSync(OUT, { recursive: true });
fs.mkdirSync(RAW, { recursive: true });

const todo = words.filter(
  (w) => force || !fs.existsSync(path.join(OUT, `${w.id}.webp`))
);

// Not an early exit: with nothing to draw there is still the cut-out pass to
// run over the cached originals, which is how the keying gets tuned for free.
if (todo.length === 0) {
  console.log('Every word already has a picture; re-cutting from the cache.');
} else {
  console.log(`Drawing ${todo.length} of ${words.length} words with ${MODEL} (low quality).`);
}

const promptFor = (word) =>
  `${OVERRIDES[word.id] ?? `a ${word.gloss}`}. ${STYLE}.`;

let done = 0;
let spentTokens = 0;
const failed = [];

async function generate(word) {
  const rawFile = path.join(RAW, `${word.id}.png`);
  if (!force && fs.existsSync(rawFile)) return rawFile;

  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const response = await fetch('https://api.openai.com/v1/images/generations', {
        method: 'POST',
        headers: {
          authorization: `Bearer ${key}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          model: MODEL,
          prompt: promptFor(word),
          size: `${SIZE}x${SIZE}`,
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
      return rawFile;
    } catch (error) {
      if (attempt === 3) throw error;
      await new Promise((r) => setTimeout(r, attempt * 4000));
    }
  }
}

/** Runs `worker` over `items`, `limit` at a time. */
async function pool(items, limit, worker) {
  const queue = [...items];
  await Promise.all(
    Array.from({ length: Math.min(limit, queue.length) }, async () => {
      while (queue.length) {
        const item = queue.shift();
        try {
          await worker(item);
          console.log(`  ${++done}/${todo.length} ${item.id} (${item.gloss})`);
        } catch (error) {
          failed.push(item.id);
          console.error(`  FAILED ${item.id}: ${error.message}`);
        }
      }
    })
  );
}

await pool(todo, CONCURRENCY, generate);

// -------------------------------------------------------- cut out and resize

/**
 * Removes the white background, then scales down and encodes as WebP.
 *
 * The cut is a flood fill seeded from the border, **not** a threshold over the
 * whole image. That distinction is the whole trick: a threshold would also
 * erase white inside the subject — the moon, the white of an eye, a bar of
 * soap — while a fill only takes white that is connected to the edge. These are
 * flat illustrations on a solid background, so the background is exactly one
 * connected region and the fill cannot leak into the subject unless the subject
 * touches the frame.
 *
 * The fill produces a hard-edged mask, which would look cut out with scissors.
 * Downscaling 1024 to 384 afterwards resolves that on its own: high-quality
 * smoothing averages the binary alpha into a smooth edge, so the anti-aliasing
 * comes free from a step that had to happen anyway.
 *
 * Full-size PNGs are about 750 KB each, which would add 25 MB to a repo whose
 * whole point is working offline on a phone. Chromium does the work because it
 * is already here for the Playwright checks.
 */
console.log('Cutting out backgrounds and resizing…');
const browser = await chromium.launch(launchOptions());
const page = await browser.newPage();

/** Every word with a cached original, so tuning the cut costs nothing. */
const toProcess = words.filter((w) =>
  fs.existsSync(path.join(RAW, `${w.id}.png`))
);

let totalBytes = 0;
const kept = [];
for (const word of toProcess) {
  const dataUrl =
    'data:image/png;base64,' +
    fs.readFileSync(path.join(RAW, `${word.id}.png`)).toString('base64');

  const result = await page.evaluate(
    async ([src, size]) => {
      const image = new Image();
      image.src = src;
      await image.decode();

      const full = document.createElement('canvas');
      full.width = image.width;
      full.height = image.height;
      const fctx = full.getContext('2d', { willReadFrequently: true });
      fctx.drawImage(image, 0, 0);

      const { width: w, height: h } = full;
      const data = fctx.getImageData(0, 0, w, h);
      const px = data.data;

      // Background: bright and near-neutral. Illustrations here are saturated,
      // so a colour with almost no saturation is background or a highlight, and
      // highlights are not connected to the border.
      const isBackground = (i) => {
        const r = px[i];
        const g = px[i + 1];
        const b = px[i + 2];
        const min = Math.min(r, g, b);
        return min > 228 && Math.max(r, g, b) - min < 20;
      };

      // Flood fill from every border pixel. Iterative: a recursive fill would
      // blow the stack on a million-pixel image.
      const seen = new Uint8Array(w * h);
      const stack = [];
      for (let x = 0; x < w; x++) {
        stack.push(x, x + (h - 1) * w);
      }
      for (let y = 0; y < h; y++) {
        stack.push(y * w, w - 1 + y * w);
      }

      let cleared = 0;
      while (stack.length) {
        const p = stack.pop();
        if (seen[p]) continue;
        seen[p] = 1;
        if (!isBackground(p * 4)) continue;
        px[p * 4 + 3] = 0;
        cleared++;

        const x = p % w;
        const y = (p - x) / w;
        if (x > 0) stack.push(p - 1);
        if (x < w - 1) stack.push(p + 1);
        if (y > 0) stack.push(p - w);
        if (y < h - 1) stack.push(p + w);
      }

      fctx.putImageData(data, 0, 0);

      // Downscale. The smoothing turns the hard alpha edge into a soft one.
      const out = document.createElement('canvas');
      out.width = out.height = size;
      const octx = out.getContext('2d');
      octx.imageSmoothingEnabled = true;
      octx.imageSmoothingQuality = 'high';
      octx.drawImage(full, 0, 0, size, size);

      return {
        url: out.toDataURL('image/webp', 0.85),
        clearedRatio: cleared / (w * h),
      };
    },
    [dataUrl, TARGET]
  );

  // A picture where almost nothing or almost everything was removed means the
  // fill leaked or found no background. Better to know than to ship it.
  if (result.clearedRatio < 0.04 || result.clearedRatio > 0.97) {
    console.warn(
      `  ! ${word.id}: cut removed ${(result.clearedRatio * 100).toFixed(0)}% — check it`
    );
  }

  const bytes = Buffer.from(result.url.split(',')[1], 'base64');
  fs.writeFileSync(path.join(OUT, `${word.id}.webp`), bytes);
  totalBytes += bytes.length;
  kept.push(word.id);
}
await browser.close();

const manifest = {
  $comment: 'Generated by tools/make-word-images.mjs. Do not edit by hand.',
  model: MODEL,
  size: TARGET,
  words: Object.fromEntries(
    readContent('words.json')
      .words.filter((w) => fs.existsSync(path.join(OUT, `${w.id}.webp`)))
      .map((w) => [w.id, `images/words/${w.id}.webp`])
  ),
};
fs.writeFileSync(
  path.join(CONTENT_DIR, 'images.json'),
  JSON.stringify(manifest, null, 0)
);

console.log(
  `\n${done - failed.length} drawn, ${kept.length} processed, ` +
    `${(totalBytes / 1024).toFixed(0)} KB written, ${spentTokens} image tokens used.`
);
console.log(`content/images.json lists ${Object.keys(manifest.words).length} pictures.`);
if (failed.length) {
  console.error(`Still missing: ${failed.join(', ')}`);
  console.error('Re-run to retry only those (finished words are skipped).');
  process.exitCode = 1;
}
