/* Draws the picture on each menu tile. */

import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';
import { launchOptions } from './browser.mjs';
import { CONTENT_DIR, ROOT } from './audio-keys.mjs';

const LETTERS = JSON.parse(fs.readFileSync(path.join(CONTENT_DIR, 'letters.json'), 'utf8')).letters;
const WORDS = JSON.parse(fs.readFileSync(path.join(CONTENT_DIR, 'words.json'), 'utf8')).words;
const NUMBERS = JSON.parse(fs.readFileSync(path.join(CONTENT_DIR, 'numbers.json'), 'utf8')).numbers;

const OUT = path.join(ROOT, 'public', 'images', 'tiles');
const RAW = path.join(ROOT, '.image-cache', 'tile');
const MODEL = 'gpt-image-2';
/* The model's square size. */
const SIZE = '1024x1024';
/* Twice the largest a tile is ever drawn (196x204, in the panel), so the art still holds up on a 2x screen. */
const TARGET = { width: 368, height: 384 };
/* Corner radius, as a fraction of the width. */
const RADIUS = 0.102;
const CONCURRENCY = 3;

/* The house style, on every prompt. */
const STYLE =
  'Soft flat vector illustration for a toddler picture book. Bright cheerful ' +
  'saturated colours, simple bold rounded shapes, clean confident outlines, no ' +
  'fine texture, no photorealism, no gradients in the background. One clear ' +
  'scene, centred, large, filling most of the frame, seen straight on against a ' +
  'plain pale background. No Latin letters, no English words, no roman alphabet ' +
  'anywhere in the picture, no logos and no captions. The one thing that must ' +
  'be written, and written clearly, is the Urdu letter described above: drawn ' +
  'large, crisp and unmistakable, in the place the scene puts it. A blank card, ' +
  'a blank badge or a blank balloon where that letter should be is a failed ' +
  'picture.';

/* How each letter is described to the model. */
function describeLetter(id, { form = 'isolated' } = {}) {
  const letter = LETTERS.find((one) => one.id === id);
  if (!letter) throw new Error(`no letter "${id}"`);
  const dots = letter.dots.count
    ? `${['', 'one dot', 'two dots', 'three dots'][letter.dots.count]} ${letter.dots.position} it`
    : 'no dots at all';
  const shape = form === 'isolated' ? '' : `, in its ${form} form as it appears inside a word`;
  // Everything about the letter is kept inside one bracket, so a brief can put it anywhere in a sentence.
  return (
    `the single large Urdu letter "${letter.char}" ` +
    `(said "${letter.roman}", written in a rounded Urdu script with ${dots}${shape})`
  );
}

/* The object that letter's word names — ب's word is بکری, so ب gets a goat. */
function objectFor(id) {
  const letter = LETTERS.find((one) => one.id === id);
  const word = WORDS.find((one) => one.id === letter?.word);
  return word?.gloss ?? null;
}

function describeNumber(id) {
  const number = NUMBERS.find((one) => one.id === id);
  if (!number) throw new Error(`no number "${id}"`);
  return `the single large Urdu numeral "${number.char}" (the number ${number.value})`;
}

/* One per menu tile, keyed by scene. */
const TILES = {
  Flashcards: {
    letter: 'be',
    scene:
      'Two rounded flash cards, one leaning behind the other. The front card is ' +
      'white and carries LETTER. The card behind it shows a friendly cartoon OBJECT.',
  },
  Trace: {
    letter: 'alif',
    scene:
      'A chubby wooden pencil with a pink eraser, resting on a white card, having ' +
      'just traced LETTER on it as a line of soft dashes.',
    object: false,
  },
  FindLetter: {
    letter: 'sin',
    scene:
      'A big round magnifying glass with a green handle held over a white card. ' +
      'LETTER fills the lens and is magnified by it.',
    object: false,
  },
  WordPictures: {
    letter: 'alif',
    scene:
      'A friendly cartoon bunch of OBJECT sitting above a white rounded plaque, ' +
      'and LETTER written on the plaque.',
  },
  StartsWith: {
    letter: 'pe',
    scene:
      'A bright diamond-shaped OBJECT with a bow tail flying in the sky, and ' +
      'below it one round badge carrying LETTER.',
  },
  Numbers: {
    number: 'n3',
    scene:
      'Three plump red apples in a row on a white plate, and above them a round ' +
      'badge carrying NUMERAL.',
  },
  Balloons: {
    letter: 'mim',
    scene:
      'Three big round party balloons on curling strings — one red, one yellow, ' +
      'one blue. The yellow one in the middle carries LETTER in white.',
    object: false,
  },
  Memory: {
    letter: 'jim',
    scene:
      'Four square cards laid out two by two. The two on one diagonal are turned ' +
      'face up and both carry LETTER; the other two are face down and plain purple.',
    object: false,
  },
  JoinForms: {
    letter: 'be',
    scene:
      'Two white puzzle pieces clicking together side by side, each carrying ' +
      'LETTER, with a small sparkle where they meet.',
    object: false,
  },
  Sequence: {
    letter: 'te',
    scene:
      'Three white cards in a row. The first two carry LETTER and a second Urdu ' +
      'letter; the third is blank with a dashed outline, waiting to be filled.',
    object: false,
  },
  Doors: {
    letter: 'dal',
    scene:
      'A small cheerful house with three coloured doors along its front. The ' +
      'middle door stands open and LETTER is inside the doorway.',
    object: false,
  },
  TapAll: {
    letter: 'sin',
    scene:
      'Six round buttons scattered on a lawn, three of them carrying LETTER and ' +
      'marked with a green tick, the other three plain.',
    object: false,
  },
  Caterpillar: {
    letter: 'nun',
    scene:
      'A friendly green caterpillar with a smiling face crawling across grass. ' +
      'Its round body segments are pale discs; one of them carries LETTER and one ' +
      'is empty with a dashed outline.',
    object: false,
  },
  LetterPuzzle: {
    letter: 'suad',
    scene:
      'A white board with LETTER on it, cut into jigsaw pieces, with one piece ' +
      'lifted out and lying beside the board.',
    object: false,
  },
  Fishing: {
    letter: 'mim',
    scene:
      'A cheerful cartoon OBJECT swimming in a pond, carrying LETTER on its side, ' +
      'with a fishing line and hook dipping into the water above it.',
  },
  Baskets: {
    letter: 'te',
    scene:
      'Two woven wicker baskets side by side on sandy ground, each with a plain ' +
      'coloured label panel on the front. LETTER is on the left basket, and one ' +
      'small card carrying an Urdu letter is falling into the right one.',
    object: false,
  },
  Whack: {
    letter: 'kaf',
    scene:
      'A grassy field with three burrow holes. Out of the middle hole pops a ' +
      'round white disc carrying LETTER.',
    object: false,
  },
  OddOne: {
    letter: 'choti-he',
    scene:
      'Four round badges in a row on a pale wall. Three of them are identical and ' +
      'plain; the fourth carries LETTER and has a bright ring drawn round it.',
    object: false,
  },
  InOrder: {
    number: 'n2',
    scene:
      'Three soap bubbles of different sizes floating up, each with a numeral ' +
      'inside it. The biggest bubble carries NUMERAL.',
  },
  Paint: {
    letter: 'ain',
    scene:
      'A paintbrush loaded with pink paint, halfway through colouring in a big ' +
      'outlined LETTER on white paper. The lower half of the letter is filled with ' +
      'colour and the top half is still white. Three blobs of paint sit nearby.',
    object: false,
  },
  ConnectPairs: {
    letter: 'wao',
    scene:
      'Two columns of small white cards on a board with a drawn line joining one ' +
      'card on the left to one on the right. The joined card on the left carries ' +
      'LETTER, and the card it joins to shows a friendly cartoon OBJECT.',
  },
  NumberLine: {
    number: 'n5',
    scene:
      'A horizontal line with tick marks and three round numbered beads on it. The ' +
      'middle bead carries NUMERAL, and one place on the line is empty with a ' +
      'dashed circle.',
  },
  Hidden: {
    letter: 'khe',
    scene:
      'A round leafy green bush with a cheerful cartoon OBJECT peeping out from ' +
      'behind it, and a white card carrying LETTER half hidden in the leaves.',
  },
  Bounce: {
    letter: 'lam',
    scene:
      'A big bouncing ball in mid-air above a lawn, carrying LETTER on its side, ' +
      'with a dashed arc showing where it has bounced.',
    object: false,
  },
  BuildWord: {
    letter: 'be',
    scene:
      'A friendly cartoon OBJECT above a row of three white slots, two of them ' +
      'filled with coloured letter tiles and the third empty. LETTER is on the ' +
      'rightmost filled tile.',
  },
  FillLetter: {
    letter: 'kaf',
    scene:
      'A row of three white cards with the middle one empty and outlined in ' +
      'orange. Below the row sit two coloured letter tiles to choose from, one of ' +
      'them carrying LETTER.',
    object: false,
  },
  JoinWord: {
    letter: 'jim',
    scene:
      'Three small white cards in a row at the top, one of them carrying LETTER, ' +
      'a downward arrow beneath them, and a wide white plaque at the bottom with a ' +
      'short handwritten Urdu word on it.',
    object: false,
  },
};

/* A tile's full prompt. */
function briefOf(name) {
  const tile = TILES[name];
  const glyph = tile.number ? describeNumber(tile.number) : describeLetter(tile.letter, tile);
  const object = tile.object === false ? null : objectFor(tile.letter);
  let scene = tile.scene.replaceAll('LETTER', glyph).replaceAll('NUMERAL', glyph);
  if (scene.includes('OBJECT')) {
    if (!object) throw new Error(`${name}: the scene wants an OBJECT and its letter has no word`);
    scene = scene.replaceAll('OBJECT', object);
  }
  return `${scene} ${STYLE}`;
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
  console.log(`Drawing ${todo.length} of ${wanted.length} tiles with ${MODEL}.`);
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
          // `briefOf` already ends with STYLE.
          prompt: briefOf(name),
          size: SIZE,
          // Medium rather than low.
          quality: 'medium',
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

console.log('Cropping, rounding and packing…');
const browser = await chromium.launch(launchOptions());
const page = await browser.newPage();

/** @returns {Promise<{webp: Buffer, ink: number}>} */
async function pack(png) {
  const result = await page.evaluate(
    async ([base64, width, height, radius]) => {
      const image = new Image();
      image.src = `data:image/png;base64,${base64}`;
      await image.decode();

      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');

      // Rounded corners first, as a clip.
      ctx.beginPath();
      ctx.roundRect(0, 0, width, height, width * radius);
      ctx.clip();

      // Cover: fill the frame, losing whatever does not fit.
      const scale = Math.max(width / image.width, height / image.height);
      ctx.drawImage(image, 0, 0, image.width * scale, image.height * scale);

      // How dark it is.
      const { data } = ctx.getImageData(0, 0, width, Math.round(height * 0.72));
      let dark = 0;
      for (let i = 0; i < data.length; i += 4) {
        if ((data[i] + data[i + 1] + data[i + 2]) / 3 < 90) dark++;
      }

      const blob = await new Promise((r) => canvas.toBlob(r, 'image/webp', 0.84));
      const buffer = new Uint8Array(await blob.arrayBuffer());
      return { webp: [...buffer], ink: dark / (data.length / 4) };
    },
    [png.toString('base64'), TARGET.width, TARGET.height, RADIUS]
  );
  return { webp: Buffer.from(result.webp), ink: result.ink };
}

let totalBytes = 0;
for (const name of wanted) {
  const rawFile = path.join(RAW, `${name}.png`);
  if (!fs.existsSync(rawFile)) continue;

  const { webp, ink } = await pack(fs.readFileSync(rawFile));
  if (ink > 0.16) {
    console.warn(`  ! ${name}: ${(ink * 100).toFixed(0)}% of it is dark — look at this one`);
  }
  fs.writeFileSync(path.join(OUT, `${name}.webp`), webp);
  totalBytes += webp.length;
  console.log(`  ${name}: ${(webp.length / 1024).toFixed(0)} KB`);
}
await browser.close();

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
console.log('Now run `npm run preview-tiles` and read every letter. See the note at the top.');
if (failed.length) {
  console.error(`Failed: ${failed.join(', ')}`);
  process.exitCode = 1;
}
