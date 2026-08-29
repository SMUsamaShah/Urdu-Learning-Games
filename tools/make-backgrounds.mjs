/* Draws a backdrop for each screen. */

import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';
import { launchOptions } from './browser.mjs';
import { CONTENT_DIR, ROOT } from './audio-keys.mjs';

const OUT = path.join(ROOT, 'public', 'images', 'backgrounds');
const RAW = path.join(ROOT, '.image-cache', 'bg');
const MODEL = 'gpt-image-2';
/* The widest the model offers. */
const SIZE = '1536x1024';
/* The design surface is 1280x720; this is that at 1x, which is enough. */
const TARGET = { width: 1280, height: 720 };
const CONCURRENCY = 3;

/* The house style, on every prompt. */
const STYLE =
  'Premium 2.5D cartoon background for a preschool learning app, wide landscape. ' +
  'Use saturated cyan, turquoise, coral, yellow, purple and green, rounded shapes, ' +
  'friendly storybook scenery, layered depth, soft glossy highlights and a lively ' +
  'RV-style educational-game finish. Scenery only: no characters, people or animals. ' +
  'Keep a large, calm, uncluttered play area through the centre so menus and game ' +
  'content remain readable; put the richer scenery along the far edges and bottom. ' +
  'Absolutely no text, letters, numbers, writing, signs or logos.';

/* One per screen, keyed by scene. */
const BACKDROPS = {
  Home: 'A sunny green meadow with rolling hills far behind, a few small ' +
    'flowers along the very bottom edge, and a tree at each far side.',
  Flashcards:
    'A bright flower garden: colourful shrubs, tulips and a low hedge along the ' +
    'bottom and far edges, with saturated blue sky through the centre. Keep the ' +
    'middle calm because a row of cards covers the bottom of this screen.',
  FindLetter:
    'A green meadow with soft rolling hills and scattered daisies along the ' +
    'bottom, a wide pale sky above.',
  Balloons:
    'A vivid turquoise sky with soft white clouds at the corners, a small rainbow ' +
    'at one far edge, and a thin strip of colourful meadow along the bottom. Keep ' +
    'the centre open for floating balloons.',
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
    'A farmyard: flat pale dirt ground across the bottom third, a low wooden ' +
    'fence and a few tufts of grass along the very bottom edge, one leafy ' +
    'tree at the far left edge, wide open sky above. Nothing in the middle — ' +
    'a barn is drawn over the middle of this screen.',
  TapAll:
    'A tidy park lawn: a neat hedge and a row of small round bushes along the ' +
    'bottom edge, one lamp post at the far right edge, wide pale sky.',
  Caterpillar:
    'A leafy garden hedge running along the bottom edge with a few round ' +
    'bushes, one tall sunflower at the far right edge, wide pale sky above.',
  LetterPuzzle:
    'A cheerful playroom: a soft turquoise wall, a colourful low shelf and toy ' +
    'blocks at the far edges, and a pale wooden floor strip along the bottom. Keep ' +
    'the centre open because a large letter puzzle sits there.',
  Fishing:
    'Underwater, seen from inside a calm pond. Flat pale turquoise water ' +
    'fills the whole picture from top to bottom. A pale sandy bed with two or ' +
    'three small rounded stones runs along the very bottom edge, and a few ' +
    'green water reeds stand at the far left and far right edges only. No ' +
    'sky, no horizon line, no fish, nothing at all in the middle.',
  Baskets:
    'A sunny market yard: a plain sandy floor across the bottom third, a low ' +
    'stone wall behind it, one striped awning at the far left edge, wide pale ' +
    'sky above.',
  BuildWord:
    'A child\'s desk seen flat on: a warm pale wooden desktop across the ' +
    'bottom third, a soft cream wall above it, one small potted plant at the ' +
    'far left edge and a few pencils lying at the far right edge. Nothing at ' +
    'all in the middle — a picture and a row of letter tiles are drawn there.',
  FillLetter:
    'A quiet classroom corner: a pale mint wall filling most of the picture, ' +
    'a low bookshelf with a few books along the very bottom edge, one small ' +
    'globe at the far right edge. Very plain and light.',
  JoinWord:
    'A colourful open picture book laid flat and seen from above: two blank cream ' +
    'pages with a soft crease down the middle, a bright ribbon bookmark and tiny ' +
    'colourful page tabs at the far edges. Keep the pages empty for the word game.',
  Whack:
    'A grassy field seen close up: flat green grass filling the lower two ' +
    'thirds with a few small daisies, a hedge along the very top of the grass ' +
    'and pale sky above it. Nothing else at all.',
  OddOne:
    'A bright empty playroom: a plain pale mint wall filling most of the ' +
    'picture, a pale wooden floor strip along the bottom edge, a small stack ' +
    'of toy blocks at the far right edge.',
  InOrder:
    'A calm shallow lagoon seen from above: flat pale turquoise water filling ' +
    'the whole picture, a curve of pale sand along the very bottom edge and a ' +
    'few green palm fronds at the far left and right edges only.',
  Paint:
    'A cheerful art room: a soft lilac wall, colourful paint pots and brushes at ' +
    'the far edges, and a pale wooden desk edge along the bottom. Keep the centre ' +
    'open because a large letter is coloured in there.',
  ConnectPairs:
    'A cheerful turquoise noticeboard wall with colourful pins and paper shapes at ' +
    'the far edges, a bright wooden frame, and a narrow shelf along the bottom. ' +
    'Keep the centre open for matching cards.',
  NumberLine:
    'A sunny railway garden: colourful gravel and two clean rails across the bottom ' +
    'third, flowers and a low hedge at the edges, one bright signal post at the far ' +
    'right, and open blue sky through the centre.',
  Hidden:
    'An overgrown garden corner: leafy green bushes and ferns filling the ' +
    'bottom third and climbing the far left and right edges, a few flowers, ' +
    'pale sky in the middle. Busier at the edges than the other scenes.',
  Bounce:
    'A gym floor seen flat on: a plain pale cream wall filling most of the ' +
    'picture, a polished wooden floor strip along the bottom edge, one ' +
    'wall-bar ladder at the far left edge, nothing in the middle.',
  Trace:
    'A bright turquoise sky with soft clouds at the top corners, colourful flowers ' +
    'and a thin strip of green grass along the bottom. Keep the centre calm because ' +
    'a large tracing card sits there.',
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

/* Runs `worker` over `items`, `limit` at a time. */
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

      // How much of this is dark.
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
  // Anything above a few per cent means a dark mass somewhere.
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

// Every backdrop on disk, not only the ones this run touched.
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
