/* Draws the furniture a game is played with. */

import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';
import { launchOptions } from './browser.mjs';
import { CONTENT_DIR, ROOT } from './audio-keys.mjs';
import { cutLooksWrong } from './cutout.mjs';

const OUT = path.join(ROOT, 'public', 'images', 'props');
const RAW = path.join(ROOT, '.image-cache', 'prop');
const MODEL = 'gpt-image-2';
const SIZE = '1024x1024';
const CONCURRENCY = 4;

/* Drawn at twice the width a scene asks for, so a prop holds up on a 2x screen. */
const DENSITY = 2;

const STYLE =
  'Flat vector illustration for a toddler game. One single object and nothing ' +
  'else, seen straight on from the front, complete and centred with a little ' +
  'clear space around it. Bright saturated colours, simple bold rounded ' +
  'shapes, clean confident outlines, soft even lighting, no fine texture, no ' +
  'photorealism. Fully transparent background with nothing at all behind the ' +
  'object: no ground, no grass, no sky, no floor, no surface for it to stand ' +
  'on, no cast shadow, no glow, no vignette. No text, no letters, no numbers, ' +
  'no logos.';

/* The props, and how wide each is drawn in the game. */
const PROPS = {
  'whack-mound': {
    // Just below the opening, not halfway down.
    width: 220,
    front: 0.3,
    brief:
      'A mound of loose dark brown earth with a round hole in the top of it, ' +
      'the opening facing the viewer, a raised crumbly rim of soil around the ' +
      'opening, a few small clods of earth on the sides of the mound.',
  },
  'bounce-trampoline': {
    width: 300,
    brief:
      "A small round child's trampoline seen from the front, a taut blue " +
      'bouncy mat stretched inside a bright padded rim, coiled springs around ' +
      'the edge, four short sturdy legs.',
  },
};

const key = process.env.OPENAI_API_KEY;
if (!key) {
  console.error('Set OPENAI_API_KEY. It is never read from a file.');
  process.exit(1);
}

const force = process.argv.includes('--force');
const onlyArg = process.argv.indexOf('--only');
const only = onlyArg > -1 ? new Set(process.argv[onlyArg + 1].split(',')) : null;

const wanted = Object.keys(PROPS).filter((name) => !only || only.has(name));

fs.mkdirSync(OUT, { recursive: true });
fs.mkdirSync(RAW, { recursive: true });

const todo = wanted.filter((name) => force || !fs.existsSync(path.join(RAW, `${name}.png`)));

if (todo.length === 0) {
  console.log('Every prop is already drawn; re-trimming from the cache.');
} else {
  console.log(`Drawing ${todo.length} of ${wanted.length} props with ${MODEL}.`);
}

let spentTokens = 0;
const failed = [];
const dropped = [];

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
          prompt: `${PROPS[name].brief} ${STYLE}`,
          size: SIZE,
          // Medium, like the tiles.
          quality: 'medium',
          background: 'transparent',
          output_format: 'png',
          n: 1,
        }),
      });

      if (!response.ok) {
        const body = await response.text();
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

console.log('Trimming and packing…');
const browser = await chromium.launch(launchOptions());
const page = await browser.newPage();

/** height: number, clearRatio: number, fringe: number}>}
 * @returns {Promise<{whole: number[], front: number[]|null, width: number,
 */
async function pack(png, width, front) {
  return page.evaluate(
    async ([base64, target, cut]) => {
      const image = new Image();
      image.src = `data:image/png;base64,${base64}`;
      await image.decode();

      const full = document.createElement('canvas');
      full.width = image.width;
      full.height = image.height;
      const fctx = full.getContext('2d', { willReadFrequently: true });
      fctx.drawImage(image, 0, 0);

      const { width: w, height: h } = full;
      const px = fctx.getImageData(0, 0, w, h).data;

      // Where the object is, and how much of the frame is empty.
      let minX = w;
      let minY = h;
      let maxX = -1;
      let maxY = -1;
      let clear = 0;
      // A halo: a pixel that is nearly transparent but not quite, sitting well outside the object.
      let fringe = 0;
      for (let p = 0; p < w * h; p++) {
        const a = px[p * 4 + 3];
        if (a < 8) {
          clear++;
          continue;
        }
        if (a < 48) fringe++;
        const x = p % w;
        const y = (p - x) / w;
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }

      if (maxX < 0) return { empty: true, clearRatio: 1 };

      const box = { width: maxX - minX + 1, height: maxY - minY + 1 };
      const scale = target / box.width;
      const outW = target;
      const outH = Math.round(box.height * scale);

      const draw = (clearAbove) => {
        const canvas = document.createElement('canvas');
        canvas.width = outW;
        canvas.height = outH;
        const ctx = canvas.getContext('2d');
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(full, minX, minY, box.width, box.height, 0, 0, outW, outH);
        // The front piece is the same canvas with its top erased.
        if (clearAbove !== null) ctx.clearRect(0, 0, outW, Math.round(outH * clearAbove));
        return canvas;
      };

      const encode = async (canvas) => {
        const blob = await new Promise((r) => canvas.toBlob(r, 'image/webp', 0.86));
        return [...new Uint8Array(await blob.arrayBuffer())];
      };

      return {
        whole: await encode(draw(null)),
        front: cut === null ? null : await encode(draw(cut)),
        width: outW,
        height: outH,
        clearRatio: clear / (w * h),
        fringe: fringe / (w * h),
      };
    },
    [png.toString('base64'), width * DENSITY, front ?? null]
  );
}

let totalBytes = 0;
// Seeded from the manifest already on disk, so a `--only` run keeps the sizes of the props it did not touch.
const manifestFile = path.join(CONTENT_DIR, 'props.json');
const sizes = fs.existsSync(manifestFile)
  ? Object.fromEntries(
      Object.entries(JSON.parse(fs.readFileSync(manifestFile, 'utf8')).props ?? {}).map(
        ([name, entry]) => [name, { width: entry.width, height: entry.height }]
      )
    )
  : {};
for (const name of wanted) {
  const rawFile = path.join(RAW, `${name}.png`);
  if (!fs.existsSync(rawFile)) continue;

  const spec = PROPS[name];
  const result = await pack(fs.readFileSync(rawFile), spec.width, spec.front);

  // Came back on a background, or came back with nothing on it.
  if (result.empty || cutLooksWrong(result.clearRatio)) {
    const share = (result.clearRatio * 100).toFixed(0);
    console.error(`  DROPPED ${name}: ${share}% of the frame is empty — not a cut-out object`);
    dropped.push(name);
    for (const file of [`${name}.webp`, `${name}-front.webp`]) {
      fs.rmSync(path.join(OUT, file), { force: true });
    }
    continue;
  }

  if (result.fringe > 0.02) {
    console.warn(
      `  ! ${name}: ${(result.fringe * 100).toFixed(1)}% of it is half-transparent — look for a halo`
    );
  }

  const write = (file, bytes) => {
    const buffer = Buffer.from(bytes);
    fs.writeFileSync(path.join(OUT, file), buffer);
    totalBytes += buffer.length;
    return buffer.length;
  };

  const bytes = write(`${name}.webp`, result.whole);
  sizes[name] = { width: result.width / DENSITY, height: result.height / DENSITY };
  let line = `  ${name}: ${result.width}x${result.height}, ${(bytes / 1024).toFixed(0)} KB`;
  if (result.front) {
    const frontBytes = write(`${name}-front.webp`, result.front);
    sizes[`${name}-front`] = sizes[name];
    line += ` (+ front, ${(frontBytes / 1024).toFixed(0)} KB)`;
  }
  console.log(line);
}
await browser.close();

const props = {};
for (const file of fs.readdirSync(OUT).sort()) {
  if (!file.endsWith('.webp')) continue;
  const name = path.basename(file, '.webp');
  props[name] = { file: `images/props/${file}`, ...sizes[name] };
}
fs.writeFileSync(
  manifestFile,
  `${JSON.stringify(
    {
      $comment: 'Generated by tools/make-props.mjs. Do not edit by hand.',
      props,
    },
    null,
    2
  )}\n`
);

console.log(
  `\n${Object.keys(props).length} files, ${(totalBytes / 1024).toFixed(0)} KB total` +
    (spentTokens ? `, ${spentTokens} output tokens spent` : ', nothing generated')
);
console.log('Now look at every one of them over a colour, not on white. See the note at the top.');
if (dropped.length) console.error(`Dropped: ${dropped.join(', ')}`);
if (failed.length) {
  console.error(`Failed: ${failed.join(', ')}`);
  process.exitCode = 1;
}
