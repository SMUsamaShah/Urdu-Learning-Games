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
 *   - **No letters from the model, in any script.** It cannot draw Urdu, and
 *     Latin letters on a screen teaching the Urdu alphabet are worse than no
 *     picture. Asked for, and checked for below by hand — see the note on
 *     `--only`.
 *
 * ## The letters are drawn here, not by the model
 *
 * That last rule is why the tiles were decorative for so long: a picture of
 * "find the letter" is a magnifying glass over *letters*, and letters were the
 * one thing the generator could not produce. So it does not. The briefs leave
 * blank places — a plain card, an unmarked balloon, an empty circle — and this
 * tool paints real Nastaliq into them afterwards, out of content/glyphs.json,
 * the same outlines the games draw. A tile now shows the thing the game
 * actually does.
 *
 * Slots are in fractions of the tile so they survive a change of TARGET, and
 * they all sit in the upper two thirds: the bottom third carries the game's
 * name at runtime and anything under there is invisible.
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

/** The baked outlines, so the tiles can carry real Urdu. See the note above. */
const GLYPHS = JSON.parse(fs.readFileSync(path.join(CONTENT_DIR, 'glyphs.json'), 'utf8'));

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
/**
 * One per menu tile, keyed by scene — plus `More` for the tile that opens the
 * rest of them.
 *
 * `art` is the brief. Each one names objects, never the lesson: "a caterpillar
 * with one segment missing" gives something a child can recognise, "a game
 * about gaps in a sequence" gives whatever the model felt like. Where a game is
 * about letters — and most of them are — the brief asks for a blank place and
 * `slots` says what to paint into it.
 *
 * A slot is `{letter | number, form, x, y, height}`. `x` and `y` are the centre
 * of the glyph and `height` its size, all as fractions of the tile, and they
 * belong in the upper two thirds because the bottom third carries the game's
 * name at runtime. `light: true` for a slot that lands on a saturated colour.
 */
const TILES = {
  Flashcards: {
    art:
      'A neat stack of blank brightly coloured rounded cards fanned out, the ' +
      'top card plain white and empty.',
    // The top card of the fan, which is what the brief keeps empty.
    slots: [{ letter: 'be', x: 0.62, y: 0.5, height: 0.3 }],
  },
  Trace: {
    art:
      'A chubby wooden crayon held upright, drawing one thick curving orange ' +
      'line with a trail of round dots along it.',
  },
  FindLetter: {
    art:
      'A big round magnifying glass with a wooden handle held over one large ' +
      'blank white rounded card, the card filling most of the lens and ' +
      'completely empty.',
    slots: [{ letter: 'be', x: 0.5, y: 0.4, height: 0.22 }],
  },
  WordPictures: {
    art:
      'An open picture book lying flat, a red apple drawn on one page and a ' +
      'yellow pear on the other. The pages carry only those two little ' +
      'drawings and no writing whatsoever.',
  },
  StartsWith: {
    art:
      'A friendly white goat standing on the left, and on the right, in the ' +
      'upper half of the picture, one large blank white rounded card standing ' +
      'upright and completely empty.',
    slots: [{ letter: 'be', x: 0.74, y: 0.36, height: 0.26 }],
  },
  Numbers: {
    art:
      'Two very large brightly coloured wooden counting blocks stacked one on ' +
      'top of the other and filling the frame, seen straight on, both faces ' +
      'completely plain and empty.',
    slots: [
      { number: 'n1', x: 0.5, y: 0.26, height: 0.16, light: true },
      { number: 'n2', x: 0.5, y: 0.53, height: 0.16, light: true },
    ],
  },
  Balloons: {
    art:
      'Three very large round balloons in bright colours on curling strings, ' +
      'floating side by side and filling the frame, each one plain with no ' +
      'markings on it at all.',
    slots: [
      { letter: 'alif', x: 0.2, y: 0.32, height: 0.19, light: true },
      { letter: 'be', x: 0.5, y: 0.28, height: 0.19, light: true },
      { letter: 'jim', x: 0.8, y: 0.32, height: 0.19, light: true },
    ],
  },
  Memory: {
    art:
      'Four blank playing cards face down in a square, one of them tipped up ' +
      'and turning over to show a plain yellow back.',
    slots: [
      { letter: 'be', x: 0.36, y: 0.36, height: 0.14, light: true },
      { letter: 'be', x: 0.65, y: 0.36, height: 0.14, light: true },
    ],
  },
  JoinForms: {
    art:
      'Three plain coloured stars of different sizes joined by a thin drawn ' +
      'line between them.',
    // One letter, on the big star. The two small stars were tried and a
    // positional form eight pixels tall on a phone is a smudge, not a lesson.
    slots: [{ letter: 'be', x: 0.47, y: 0.36, height: 0.16, light: true }],
  },
  Sequence: {
    art: 'Five flat round stepping stones in a rising row across a green lawn.',
  },
  Doors: {
    art:
      'A small red barn seen straight on with its two wooden doors open, a ' +
      'friendly duck peeking out of the doorway.',
  },
  TapAll: {
    art:
      'Three very large plain coloured circles in a row across the upper half ' +
      'of the picture, completely empty, and a pointing hand below reaching up ' +
      'to tap the middle one, with a soft ring of ripples around it.',
    slots: [
      { letter: 'be', x: 0.2, y: 0.3, height: 0.16, light: true },
      { letter: 'be', x: 0.5, y: 0.3, height: 0.16, light: true },
      { letter: 'te', x: 0.8, y: 0.3, height: 0.16, light: true },
    ],
  },
  Caterpillar: {
    art:
      'A smiling green caterpillar seen from the side, made of three very ' +
      'large plain round segments in a row across the middle of the picture, ' +
      'with a clear empty gap where a fourth segment should be.',
    slots: [
      { letter: 'alif', x: 0.62, y: 0.41, height: 0.13, light: true },
      { letter: 'be', x: 0.76, y: 0.41, height: 0.13, light: true },
    ],
  },
  LetterPuzzle: {
    art:
      'Two very large brightly coloured jigsaw pieces side by side in the ' +
      'upper half, both plain and unmarked, one of them lifted slightly away ' +
      'from the other leaving a gap between them.',
    slots: [
      { letter: 'be', x: 0.3, y: 0.34, height: 0.17, light: true },
      { letter: 'te', x: 0.68, y: 0.34, height: 0.17, light: true },
    ],
  },
  Fishing: {
    art:
      'A bamboo fishing rod with its line dipping into a small round pond, ' +
      'and one very large orange fish jumping clear of the water in the upper ' +
      'half, its broad flat side facing the viewer and completely plain.',
    slots: [{ letter: 'be', x: 0.58, y: 0.34, height: 0.12, light: true }],
  },
  Baskets: {
    art:
      'Two woven baskets side by side in the lower half, and above each ' +
      'basket one very large plain ball hanging in the air about to drop in, ' +
      'the left ball red and the right ball blue, both completely unmarked.',
    slots: [
      { letter: 'be', x: 0.27, y: 0.23, height: 0.15, light: true },
      { letter: 'te', x: 0.73, y: 0.23, height: 0.15, light: true },
    ],
  },
  Whack: {
    art:
      'Three little mounds of earth in a row across the middle of the ' +
      'picture, a cheerful mole popping up out of the middle one holding a ' +
      'large blank white rounded sign above its head.',
    slots: [{ letter: 'be', x: 0.5, y: 0.28, height: 0.18 }],
  },
  OddOne: {
    art: 'Three identical red apples in a row and one yellow banana at the end.',
  },
  InOrder: {
    art: 'A rising line of soap bubbles of increasing size against a pale sky.',
  },
  Paint: {
    art:
      'An artist palette with blobs of bright paint and a fat brush resting ' +
      'on it, a few colourful splashes around.',
  },
  ConnectPairs: {
    art:
      'On the left, two large plain white rounded cards stacked one above the ' +
      'other and completely empty. On the right, level with them, a red apple ' +
      'and a yellow pear. A curved coloured thread joins each card across to ' +
      'the fruit beside it.',
    slots: [
      { letter: 'alif', x: 0.24, y: 0.26, height: 0.16 },
      { letter: 'be', x: 0.24, y: 0.55, height: 0.16 },
    ],
  },
  NumberLine: {
    art:
      'Three very large plain wooden discs in a rising row across the upper ' +
      'half of the picture, like stepping stones going up, each one round and ' +
      'flat and completely empty, with a thin line drawn between them.',
    slots: [
      { number: 'n1', x: 0.22, y: 0.44, height: 0.13 },
      { number: 'n2', x: 0.5, y: 0.32, height: 0.13 },
      { number: 'n3', x: 0.78, y: 0.2, height: 0.13 },
    ],
  },
  Hidden: {
    art:
      'A big round leafy green bush filling the lower half, with one large ' +
      'blank white rounded card standing up behind it, its top half showing ' +
      'above the leaves and completely empty.',
    slots: [{ letter: 'be', x: 0.5, y: 0.24, height: 0.18 }],
  },
  Bounce: {
    art:
      'One very large plain blue ball high in the air above a small ' +
      'trampoline, filling the upper half of the picture and completely ' +
      'unmarked, with a dotted arc showing the path it bounced along.',
    slots: [{ letter: 'be', x: 0.5, y: 0.28, height: 0.18, light: true }],
  },
  More: {
    art:
      'An open wooden treasure chest with brightly coloured toy balls, blocks ' +
      'and a spinning top spilling out of it.',
  },
};

/** The brief for a tile, whichever shape its entry is in. */
const briefOf = (name) => TILES[name].art;

/**
 * A slot's outline, out of the baked glyphs.
 *
 * Letters default to their isolated form, which is the shape a child meets
 * first and the one every game shows on a tile or a balloon.
 */
function glyphFor(slot) {
  if (slot.number) return GLYPHS.numbers[slot.number] ?? null;
  return GLYPHS.letters[slot.letter]?.[slot.form ?? 'isolated'] ?? null;
}

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
          prompt: `${briefOf(name)} ${STYLE}`,
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
async function pack(png, slots = []) {
  const result = await page.evaluate(
    async ([base64, width, height, radius, scrim, marks]) => {
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

      // The letters, painted over the picture and under the scrim.
      //
      // The same Path2D fill src/lib/glyph.js does at runtime — a baked outline
      // is font units, y-down, with its bounding box recorded, so it is one
      // translate and one scale. Each is drawn twice: a fat round-joined stroke
      // first as a halo, then the fill. Without the halo a dark letter on a
      // dark balloon disappears, and there is no telling in advance what colour
      // the generator will have put underneath.
      for (const mark of marks) {
        const [bx, by, bw, bh] = mark.bbox;
        if (!mark.d || bh <= 0) continue;
        const scale = (mark.height * height) / bh;
        ctx.save();
        ctx.translate(mark.x * width - (bw * scale) / 2, mark.y * height - (bh * scale) / 2);
        ctx.translate(-bx * scale, -by * scale);
        ctx.scale(scale, scale);
        const path = new Path2D(mark.d);
        ctx.lineJoin = 'round';
        ctx.lineCap = 'round';
        ctx.strokeStyle = mark.light ? 'rgba(43,48,71,0.55)' : '#ffffff';
        // A tenth of the letter's height, half of which shows outside it. In
        // font units, because the context is scaled — a line specified in
        // pixels here would land ten times heavier on a glyph with a deep
        // descender, which is the trap src/lib/glyph.js documents at length.
        ctx.lineWidth = (mark.height * height * 0.1) / scale;
        ctx.stroke(path);
        ctx.fillStyle = mark.light ? '#ffffff' : '#2b3047';
        ctx.fill(path, 'nonzero');
        ctx.restore();
      }

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
    [png.toString('base64'), TARGET.width, TARGET.height, RADIUS, SCRIM, slots]
  );
  return { webp: Buffer.from(result.webp), ink: result.ink };
}

let totalBytes = 0;
for (const name of wanted) {
  const rawFile = path.join(RAW, `${name}.png`);
  if (!fs.existsSync(rawFile)) continue;

  // Slots resolved here rather than in the page: a missing glyph is a typo in
  // a brief, and it should say so by name instead of drawing nothing.
  const slots = (TILES[name].slots ?? []).map((slot) => {
    const glyph = glyphFor(slot);
    if (!glyph) {
      throw new Error(`${name}: no glyph for ${JSON.stringify(slot)} — check the id and form`);
    }
    return { ...slot, d: glyph.d, bbox: glyph.bbox };
  });

  const { webp, ink } = await pack(fs.readFileSync(rawFile), slots);
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
