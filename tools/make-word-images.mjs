/* Draws every word in content/words.json. */

import fs from 'node:fs';
import path from 'node:path';
import { CONTENT_DIR, ROOT, readContent } from './audio-keys.mjs';
import { cutLooksWrong, openCutter } from './cutout.mjs';

const OUT = path.join(ROOT, 'public', 'images', 'words');
const RAW = path.join(ROOT, '.image-cache');
const MODEL = 'gpt-image-2';
const SIZE = 1024;
/* Displayed at roughly 190px, so this stays crisp on a 2x screen. */
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
  'thick clean outlines, bright cheerful colours, one single object centred on ' +
  'a fully transparent background, nothing behind it, no text, no letters, ' +
  'no numbers';

/* Subjects the English gloss alone would get wrong. */
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
  // The nose on its own.
  naak: 'a single human nose on its own, front view, no face around it, no eyes, no mouth, no head',
  qalam: 'a single pen at a slight angle',
  saabun: 'a bar of soap with a few bubbles',
  jahaaz: 'a passenger aeroplane flying',
  ghubara: 'a single bright party balloon on a string',
  footbal: 'a classic black and white football',
  zaroof: 'a neat stack of colourful plates with a teacup and a bowl beside it',
  zakheera:
    'a neat pile of stored goods, stacked wooden crates and bulging sacks ' +
    'of grain with a couple of jars beside them',
  zaeef:
    'a kindly elderly person with white hair and a walking stick, standing, smiling',
};

const words = readContent('words.json').words.filter(
  (w) => !only || only.has(w.id)
);

fs.mkdirSync(OUT, { recursive: true });
fs.mkdirSync(RAW, { recursive: true });

const todo = words.filter(
  (w) => force || !fs.existsSync(path.join(OUT, `${w.id}.webp`))
);

// Still run the cut-out pass for cached originals.
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
          // PNG because it is the only output format that carries alpha.
          background: 'transparent',
          output_format: 'png',
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

/* Runs `worker` over `items`, `limit` at a time. */
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

console.log('Cutting out backgrounds and resizing…');
const cutter = await openCutter();

/* Every word with a cached original, so tuning the cut costs nothing. */
const toProcess = words.filter((w) => fs.existsSync(path.join(RAW, `${w.id}.png`)));

let totalBytes = 0;
let keyedCount = 0;
const kept = [];
for (const word of toProcess) {
  const { webp, clearedRatio, keyed } = await cutter.cut(
    fs.readFileSync(path.join(RAW, `${word.id}.png`)),
    TARGET
  );
  if (keyed) keyedCount++;

  // A picture that is almost all background.
  if (cutLooksWrong(clearedRatio)) {
    console.warn(
      `  ! ${word.id}: ${(clearedRatio * 100).toFixed(0)}% of it is background — check it`
    );
  }

  fs.writeFileSync(path.join(OUT, `${word.id}.webp`), webp);
  totalBytes += webp.length;
  kept.push(word.id);
}
await cutter.close();

// Report the number of images that still need generation.
if (keyedCount) {
  console.log(
    `${keyedCount} of ${toProcess.length} arrived on a background and had it keyed out.`
  );
}

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
