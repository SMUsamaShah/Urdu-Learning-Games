/**
 * Draws the picture on each menu tile.
 *
 * The menu used to be twenty-four coloured rectangles with an Urdu word on
 * each. That is fine for a parent and close to useless for the child it is
 * for: a three-year-old cannot read either script, so every tile said the same
 * thing to them, and picking a game meant remembering a position. The apps this
 * is modelled on put a picture of the activity on every tile and no text at
 * all — you tap the balloons because you can see balloons.
 *
 * ## What makes a usable tile, which is the opposite of a backdrop
 *
 * make-backgrounds.mjs asks for pale, quiet pictures with an empty middle,
 * because letters are drawn over those. Nothing is drawn over these, so they
 * want the opposite: one loud subject, filling the frame, readable at 173
 * pixels across on a phone held at arm's length.
 *
 *   - **One thing.** A scene with three ideas in it turns to mush at tile size.
 *   - **Filling the frame.** Margins are wasted pixels; the tile is small.
 *   - **Nothing at the bottom.** The name sits over the bottom third, on a
 *     scrim this tool bakes in, so the subject belongs above it.
 *   - **No letters, in any script.** The model cannot draw Urdu, and Latin
 *     letters on a screen teaching the Urdu alphabet are worse than no picture.
 *     Asked for, and checked for below by hand — see the note on `--only`.
 *
 * ## Cost and repeatability
 *
 * Generated once and committed. Raw PNGs are cached in .image-cache/tile/, so
 * re-running to retune the crop, the corner radius or the scrim is free and
 * offline; only a new tile or `--force` spends anything.
 *
 * Usage:
 *   OPENAI_API_KEY=... node tools/make-tile-art.mjs [--force] [--only Balloons,Fishing]
 *
 * The key is only ever read from the environment. Do not put it in a file.
 */

import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';
import { launchOptions } from './browser.mjs';
import { CONTENT_DIR, ROOT } from './audio-keys.mjs';

const OUT = path.join(ROOT, 'public', 'images', 'tiles');
const RAW = path.join(ROOT, '.image-cache', 'tile');
const MODEL = 'gpt-image-2';
/** The model's square size. Cropped to the tile's shape below. */
const SIZE = '1024x1024';
/**
 * Twice the largest a tile is ever drawn (196x204, in the panel), so the art
 * still holds up on a 2x screen. The two grids are deliberately the same shape
 * — see game-tile.js — so one picture serves both.
 */
const TARGET = { width: 368, height: 384 };
/**
 * Corner radius, as a fraction of the width. Baked into the alpha rather than
 * masked at runtime: Phaser 4 has no bitmap masks, and a geometry mask per tile
 * is twenty-four stencil passes on a menu that has to appear instantly. Rounder
 * than the card underneath by a few pixels, so the card shows as a thin
 * coloured frame — which is what the reference app's tiles do.
 */
const RADIUS = 0.102;
/**
 * A faint darkening across the bottom, where the name's coloured band goes.
 *
 * The band is drawn at runtime in the game's own colour and at 90% alpha, so
 * this is not what makes the name readable — it is only there so the 10% of the
 * picture showing through does not glare where the band meets it. It was 62%
 * once, doing the whole job on its own, and white Urdu over a pale grey wash on
 * a pale illustration was unreadable at tile size.
 */
const SCRIM = { height: 0.38, alpha: 0.22 };
const CONCURRENCY = 3;

/**
 * The house style, on every prompt.
 *
 * One illustrator's brief rather than a list of tags, so that twenty-five
 * pictures look like a set rather than twenty-five stock images. Kept close to
 * the backdrops' brief in palette and line so the tile and the screen it opens
 * feel like the same app.
 */
const STYLE =
  'Soft flat vector illustration for a toddler picture book. Bright cheerful ' +
  'saturated colours, simple bold rounded shapes, thick soft outlines, no fine ' +
  'texture, no photorealism. One single clear subject, centred, large, filling ' +
  'most of the frame, seen straight on against a simple plain pale background. ' +
  'The subject sits in the upper two thirds; the bottom third is plain and ' +
  'empty. Absolutely no text, no letters, no numbers, no writing, no signs, no ' +
  'logos, no labels of any kind.';

/**
 * One per menu tile, keyed by scene — plus `More` for the tile that opens the
 * rest of them.
 *
 * Each brief names objects, never the lesson: "a caterpillar with one segment
 * missing" gives something a child can recognise, "a game about gaps in a
 * sequence" gives whatever the model felt like. Where a game is about letters —
 * and most of them are — the brief substitutes blank coloured cards, because
 * the model cannot draw Urdu and will cheerfully put English on the tile of an
 * Urdu app if given the chance.
 */
const TILES = {
  Flashcards:
    'A neat stack of blank brightly coloured rounded cards fanned out, the ' +
    'top card plain white and empty.',
  Trace:
    'A chubby wooden crayon held upright, drawing one thick curving orange ' +
    'line with a trail of round dots along it.',
  FindLetter:
    'A big round magnifying glass with a wooden handle, held over three plain ' +
    'coloured circles.',
  WordPictures:
    'An open picture book lying flat, a red apple drawn on one page and a ' +
    'yellow pear on the other. The pages carry only those two little ' +
    'drawings and no writing whatsoever.',
  StartsWith:
    'A friendly white goat standing beside three small blank coloured cards.',
  Numbers: 'A tall stack of brightly coloured wooden counting blocks, all plain and blank.',
  Balloons: 'A bunch of five round balloons in bright colours on curling strings, floating.',
  Memory:
    'Four blank playing cards face down in a square, one of them tipped up ' +
    'and turning over to show a plain yellow back.',
  JoinForms:
    'Three plain coloured stars of different sizes joined by a thin drawn line ' +
    'between them.',
  Sequence: 'Five flat round stepping stones in a rising row across a green lawn.',
  Doors:
    'A small red barn seen straight on with its two wooden doors open, a ' +
    'friendly duck peeking out of the doorway.',
  TapAll:
    'A pointing hand tapping the middle one of several bright scattered ' +
    'circles, with a soft ring of ripples around it.',
  Caterpillar:
    'A smiling green caterpillar made of round segments, with one segment ' +
    'missing from the middle leaving a gap.',
  LetterPuzzle:
    'Four brightly coloured jigsaw pieces, three of them joined and one ' +
    'floating just above its empty slot.',
  Fishing:
    'A bamboo fishing rod with its line dipping into a small round pond, one ' +
    'orange fish jumping.',
  Baskets:
    'Two woven baskets side by side, one filled with red balls and one with ' +
    'blue balls.',
  Whack:
    'Three little mounds of earth in a row, a cheerful mole popping up out of ' +
    'the middle one.',
  OddOne: 'Three identical red apples in a row and one yellow banana at the end.',
  InOrder: 'A rising line of soap bubbles of increasing size against a pale sky.',
  Paint:
    'An artist palette with blobs of bright paint and a fat brush resting on ' +
    'it, a few colourful splashes around.',
  ConnectPairs:
    'Two columns of coloured dots joined across the gap by three curved ' +
    'coloured threads.',
  NumberLine:
    'A short wooden ladder lying flat with a round red ball resting on each of ' +
    'the first three rungs.',
  Hidden:
    'A big round leafy green bush with two friendly cartoon eyes peeking out ' +
    'from inside it.',
  Bounce:
    'A round red-and-blue ball bouncing off a small trampoline, with a dotted ' +
    'arc showing its path.',
  More:
    'An open wooden treasure chest with brightly coloured toy balls, blocks ' +
    'and a spinning top spilling out of it.',
};

const key = process.env.OPENAI_API_KEY;
if (!key) {
  console.error('Set OPENAI_API_KEY. It is never read from a file.');
  process.exit(1);
}

const force = process.argv.includes('--force');
const onlyArg = process.argv.indexOf('--only');
const only = onlyArg > -1 ? new Set(process.argv[onlyArg + 1].split(',')) : null;

const wanted = Object.keys(TILES).filter((name) => !only || only.has(name));

fs.mkdirSync(OUT, { recursive: true });
fs.mkdirSync(RAW, { recursive: true });

const todo = wanted.filter((name) => force || !fs.existsSync(path.join(RAW, `${name}.png`)));

if (todo.length === 0) {
  console.log('Every tile is already drawn; re-cropping from the cache.');
} else {
  console.log(`Drawing ${todo.length} of ${wanted.length} tiles with ${MODEL} (low quality).`);
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
          prompt: `${TILES[name]} ${STYLE}`,
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

// ------------------------------------------------------- crop, round and pack
//
// A browser, for the same reason make-backgrounds.mjs uses one: it has a good
// decoder, a good scaler and a WebP encoder, and pulling one of each from npm
// to process twenty-five pictures is not a trade worth making.

console.log('Cropping, rounding and packing…');
const browser = await chromium.launch(launchOptions());
const page = await browser.newPage();

/** @returns {Promise<{webp: Buffer, ink: number}>} */
async function pack(png) {
  const result = await page.evaluate(
    async ([base64, width, height, radius, scrim]) => {
      const image = new Image();
      image.src = `data:image/png;base64,${base64}`;
      await image.decode();

      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');

      // Rounded corners first, as a clip. Baked into the file so the runtime
      // draws a plain sprite; see RADIUS above for why not a mask.
      ctx.beginPath();
      ctx.roundRect(0, 0, width, height, width * radius);
      ctx.clip();

      // Cover: fill the frame, losing whatever does not fit. The square
      // original is taller than the tile, and the brief puts the subject in the
      // upper two thirds, so the loss comes off the bottom.
      const scale = Math.max(width / image.width, height / image.height);
      ctx.drawImage(image, 0, 0, image.width * scale, image.height * scale);

      // The scrim the name sits on. Baked in for the same reason as the
      // corners, and because a gradient tuned once here is one that cannot
      // drift between the two grids that draw these.
      const fade = ctx.createLinearGradient(0, height * (1 - scrim.height), 0, height);
      fade.addColorStop(0, 'rgba(20,22,34,0)');
      fade.addColorStop(0.55, `rgba(20,22,34,${scrim.alpha * 0.72})`);
      fade.addColorStop(1, `rgba(20,22,34,${scrim.alpha})`);
      ctx.fillStyle = fade;
      ctx.fillRect(0, height * (1 - scrim.height), width, height * scrim.height);

      // How dark the *top* is — the part the subject lives in. A tile that came
      // back as a night scene puts a dark mass next to a white rim and reads as
      // a hole in the menu. The scrimmed bottom is excluded on purpose.
      const { data } = ctx.getImageData(0, 0, width, Math.round(height * 0.62));
      let dark = 0;
      for (let i = 0; i < data.length; i += 4) {
        if ((data[i] + data[i + 1] + data[i + 2]) / 3 < 90) dark++;
      }

      const blob = await new Promise((r) => canvas.toBlob(r, 'image/webp', 0.84));
      const buffer = new Uint8Array(await blob.arrayBuffer());
      return { webp: [...buffer], ink: dark / (data.length / 4) };
    },
    [png.toString('base64'), TARGET.width, TARGET.height, RADIUS, SCRIM]
  );
  return { webp: Buffer.from(result.webp), ink: result.ink };
}

let totalBytes = 0;
for (const name of wanted) {
  const rawFile = path.join(RAW, `${name}.png`);
  if (!fs.existsSync(rawFile)) continue;

  const { webp, ink } = await pack(fs.readFileSync(rawFile));
  if (ink > 0.14) {
    console.warn(`  ! ${name}: ${(ink * 100).toFixed(0)}% of the top is dark — check this one`);
  }
  fs.writeFileSync(path.join(OUT, `${name}.webp`), webp);
  totalBytes += webp.length;
  console.log(`  ${name}: ${(webp.length / 1024).toFixed(0)} KB`);
}
await browser.close();

// --------------------------------------------------------------- the manifest
//
// Built from what is on disk rather than from what this run happened to touch.
// Writing only the files this run produced is how `--only` once quietly cut the
// backgrounds manifest down to two entries and every other screen fell back to
// the drawn meadow without a word.

const tiles = {};
for (const file of fs.readdirSync(OUT).sort()) {
  if (file.endsWith('.webp')) tiles[path.basename(file, '.webp')] = `images/tiles/${file}`;
}
fs.writeFileSync(
  path.join(CONTENT_DIR, 'tiles.json'),
  `${JSON.stringify({ tiles }, null, 2)}\n`
);

console.log(
  `\n${Object.keys(tiles).length} tiles, ${(totalBytes / 1024).toFixed(0)} KB total` +
    (spentTokens ? `, ${spentTokens} output tokens spent` : ', nothing generated')
);
if (failed.length) {
  console.error(`Failed: ${failed.join(', ')}`);
  process.exitCode = 1;
}
