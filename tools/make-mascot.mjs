/**
 * Draws the mascot.
 *
 * The character is the one piece of art in this app that a person will look at
 * on every screen for months, so it is worth drawing properly rather than
 * assembling out of arcs. Everything else here stays procedural.
 *
 * ## Why poses and not a sprite sheet
 *
 * The obvious idea is to ask for a sprite sheet and play it back. Image models
 * are worse at that than at almost anything else: every cell drifts in size and
 * position, the character's face changes between frames, and nothing lines the
 * pivots up. What they are good at is drawing the same character again in a
 * different pose, given the first drawing to work from — so that is what this
 * does. Three whole poses, swapped between, with the liveliness coming from
 * tweens on the whole sprite.
 *
 * ## Two stages
 *
 *   node tools/make-mascot.mjs --variants 6
 *       Draws candidate idle poses and writes a contact sheet to look at.
 *       Nothing is promoted; this stage is for choosing.
 *
 *   node tools/make-mascot.mjs --pick 3
 *       Takes that candidate as the character, asks for the other poses as
 *       edits of it so they stay the same spider, cuts the backgrounds out and
 *       writes public/images/mascot/.
 *
 * Candidates are cached in .image-cache/mascot/, so picking, re-cutting and
 * re-running the poses costs nothing after the first draw.
 *
 * The key is only ever read from the environment. Do not put it in a file.
 */

import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from './audio-keys.mjs';
import { cutLooksWrong, openCutter } from './cutout.mjs';

const OUT = path.join(ROOT, 'public', 'images', 'mascot');
const RAW = path.join(ROOT, '.image-cache', 'mascot');
const MODEL = 'gpt-image-2';
const SIZE = 1024;
/** Drawn at roughly 250px tall, so this stays crisp on a 2x screen. */
const TARGET = 512;

const key = process.env.OPENAI_API_KEY;
if (!key) {
  console.error('Set OPENAI_API_KEY. It is never read from a file.');
  process.exit(1);
}

const arg = (name) => {
  const i = process.argv.indexOf(name);
  return i > -1 ? process.argv[i + 1] : null;
};

/**
 * The character, described once and repeated in every prompt.
 *
 * Repeated rather than referenced because the pose edits go back to the model
 * as a fresh request each time, and dropping the description there is how a
 * character quietly turns into a different one between poses.
 */
const CHARACTER =
  'an adorable fluffy cartoon jumping spider mascot for a toddler learning app: ' +
  'a small round body covered in soft fuzzy fur, a big rounded fuzzy head with ' +
  'two enormous dark forward-facing eyes with big bright white highlights, a row ' +
  'of four tiny eyes above them, warm caramel brown and grey fur with a paler ' +
  'fuzzy chest, a tiny happy smile, eight short fuzzy legs with soft rounded ' +
  'tips, sitting upright facing the viewer looking sweet and friendly like a ' +
  'plush toy';

const STYLE =
  'Soft-shaded cartoon illustration for a preschool app, plush toy feel, fuzzy ' +
  'fur texture, gentle rounded shapes, warm friendly lighting, a bold dark ' +
  'outline around the whole character so it reads at small size, the whole ' +
  'character visible with clear space around it, on a fully transparent ' +
  'background with nothing behind it, no text, no letters, no numbers, ' +
  'no ground, no scenery';

const POSES = {
  idle: 'standing still and smiling, front legs relaxed at its sides',
  // Pointing towards the right-hand edge of the picture, because the mascot
  // stands at the left of every screen and the answers are to its right.
  point:
    'smiling and pointing towards the right-hand side of the picture with one ' +
    'front leg held straight out sideways, the other legs relaxed',
  cheer:
    'celebrating with both front legs raised high above its head, eyes happy ' +
    'and mouth open in a cheer',
  // A blink is one frame, not an animation. Swapping to it for a tenth of a
  // second is most of what makes a drawing feel like it is alive.
  blink:
    'standing still and smiling exactly as before but with both eyes closed, ' +
    'drawn as two simple downward-curved lashes, front legs relaxed at its sides',
};

fs.mkdirSync(RAW, { recursive: true });

async function post(url, body, headers = {}) {
  for (let attempt = 1; attempt <= 3; attempt++) {
    const response = await fetch(url, {
      method: 'POST',
      headers: { authorization: `Bearer ${key}`, ...headers },
      body,
    });
    if (response.ok) return response.json();

    const text = await response.text();
    if ((response.status === 429 || response.status >= 500) && attempt < 3) {
      await new Promise((r) => setTimeout(r, attempt * 8000));
      continue;
    }
    throw new Error(`${response.status}: ${text.slice(0, 300)}`);
  }
}

const generate = (prompt) =>
  post(
    'https://api.openai.com/v1/images/generations',
    JSON.stringify({
      model: MODEL,
      prompt,
      size: `${SIZE}x${SIZE}`,
      quality: 'low',
      background: 'transparent',
      output_format: 'png',
      n: 1,
    }),
    { 'content-type': 'application/json' }
  );

/** Redraws an existing image. This is what keeps the poses one character. */
function edit(file, prompt) {
  const form = new FormData();
  form.set('model', MODEL);
  form.set('prompt', prompt);
  form.set('size', `${SIZE}x${SIZE}`);
  form.set('quality', 'low');
  // Asked for on the edit as well as the generation. If the edits endpoint
  // ignores it the picture comes back on white and cutout.mjs keys it, which
  // is the arrangement that held for every frame drawn before this.
  form.set('background', 'transparent');
  form.set('output_format', 'png');
  form.set('n', '1');
  form.set('image', new Blob([fs.readFileSync(file)], { type: 'image/png' }), 'base.png');
  return post('https://api.openai.com/v1/images/edits', form);
}

const save = (file, data) => fs.writeFileSync(file, Buffer.from(data.data[0].b64_json, 'base64'));

// ------------------------------------------------------------------ stage 1

if (arg('--variants')) {
  const count = Number(arg('--variants'));
  console.log(`Drawing ${count} candidate spiders with ${MODEL} (low quality).`);

  const prompt = `${CHARACTER}, ${POSES.idle}. ${STYLE}.`;
  await Promise.all(
    Array.from({ length: count }, async (_, i) => {
      const file = path.join(RAW, `candidate-${i + 1}.png`);
      save(file, await generate(prompt));
      console.log(`  candidate-${i + 1}.png`);
    })
  );

  // A contact sheet, because choosing between six characters means seeing them
  // next to each other rather than opening six files.
  const cutter = await openCutter();
  const sheet = path.join(RAW, 'candidates.html');
  fs.writeFileSync(
    sheet,
    `<body style="margin:0;display:grid;grid-template-columns:repeat(3,1fr);background:#fdf3e3">` +
      Array.from({ length: count }, (_, i) => {
        const b64 = fs.readFileSync(path.join(RAW, `candidate-${i + 1}.png`)).toString('base64');
        return `<figure style="margin:0;padding:8px"><img src="data:image/png;base64,${b64}" style="width:100%">
          <figcaption style="font:600 28px system-ui;text-align:center">${i + 1}</figcaption></figure>`;
      }).join('') +
      `</body>`
  );
  await cutter.close();
  console.log(`\nOpen ${path.relative(ROOT, sheet)} and pick one, then:`);
  console.log('  node tools/make-mascot.mjs --pick <n>');
  process.exit(0);
}

// ------------------------------------------------------------------ stage 2

const pick = arg('--pick');
if (!pick) {
  console.error('Usage: --variants <n> to draw candidates, then --pick <n>.');
  process.exit(1);
}

const base = path.join(RAW, `candidate-${pick}.png`);
if (!fs.existsSync(base)) {
  console.error(`No ${path.relative(ROOT, base)}. Run --variants first.`);
  process.exit(1);
}

fs.mkdirSync(OUT, { recursive: true });

// Poses are cached, so picking a different candidate has to throw the old ones
// away. Without this, changing your mind about the character silently keeps
// three poses of the previous one and only redraws the base.
const stamp = path.join(RAW, 'picked.txt');
const previous = fs.existsSync(stamp) ? fs.readFileSync(stamp, 'utf8').trim() : null;
if (previous && previous !== pick) {
  console.log(`Character changed (${previous} -> ${pick}); redrawing every pose.`);
  for (const name of Object.keys(POSES)) fs.rmSync(path.join(RAW, `${name}.png`), { force: true });
}
fs.writeFileSync(stamp, pick);
fs.copyFileSync(base, path.join(RAW, 'idle.png'));

for (const [name, pose] of Object.entries(POSES)) {
  const file = path.join(RAW, `${name}.png`);
  if (fs.existsSync(file)) {
    console.log(`  ${name}: cached`);
    continue;
  }
  console.log(`  ${name}: redrawing the same spider…`);
  save(
    file,
    await edit(
      base,
      `Redraw exactly this same character, unchanged in colour, shape and face, ` +
        `${pose}. ${STYLE}.`
    )
  );
}

// ------------------------------------------------------- cut out and line up
//
// The model redraws the character at a slightly different size and position
// every time. Swapped in place that reads as the spider jolting sideways and
// changing size whenever it blinks, which is the failure this whole technique
// is prone to and the reason a naive set of poses looks broken.
//
// So each pose is measured and then redrawn to sit where the idle pose sits.
// The anchor is the feet, not the bounding box: raising a leg to point moves
// the bounding box but not the part of the spider standing on the ground.

console.log('Cutting out backgrounds…');
const cutter = await openCutter();
const names = Object.keys(POSES);

const measured = {};
for (const name of names) {
  const png = fs.readFileSync(path.join(RAW, `${name}.png`));
  const { clearedRatio, metrics } = await cutter.cut(png, TARGET);
  if (cutLooksWrong(clearedRatio)) {
    console.warn(`  ! ${name}: cut removed ${(clearedRatio * 100).toFixed(0)}% — look at it`);
  }
  measured[name] = { png, metrics };
}

const anchor = measured.idle.metrics;

/** Feet-aligned transform per pose, before anything is made to fit. */
const aligned = {};
for (const name of names) {
  const { metrics } = measured[name];
  const scale = anchor.footWidth / metrics.footWidth;
  aligned[name] = {
    scale,
    tx: anchor.footCentre - scale * metrics.footCentre,
    ty: anchor.bottom - scale * metrics.bottom,
  };
}

// Aligning can push a pose off the edge — pointing sticks a leg out sideways
// and cheering sticks two up, and either can now land outside the frame. So
// every pose is shrunk by one shared factor, chosen so the widest and tallest
// of them fits. One factor for all of them, because a per-pose fit would undo
// the alignment that is the whole point of this.
const boxes = names.map((name) => {
  const t = aligned[name];
  const b = measured[name].metrics.bbox;
  return {
    left: t.scale * b.x + t.tx,
    right: t.scale * (b.x + b.width) + t.tx,
    top: t.scale * b.y + t.ty,
    bottom: t.scale * (b.y + b.height) + t.ty,
  };
});
const union = {
  left: Math.min(...boxes.map((b) => b.left)),
  right: Math.max(...boxes.map((b) => b.right)),
  top: Math.min(...boxes.map((b) => b.top)),
  bottom: Math.max(...boxes.map((b) => b.bottom)),
};

const MARGIN = 12;
const fit = Math.min(
  1,
  (SIZE - MARGIN * 2) / (union.right - union.left),
  // No bottom margin: the feet land on the bottom edge of the image, so a
  // scene can stand the sprite on the ground with an origin of (0.5, 1) and
  // not have to know anything about how it was drawn.
  (SIZE - MARGIN) / (union.bottom - union.top)
);
const shift = {
  x: SIZE / 2 - fit * ((union.left + union.right) / 2),
  y: SIZE - fit * union.bottom,
};
console.log(`  fitting all four at ${fit.toFixed(3)}`);

let bytes = 0;
for (const name of names) {
  const { png } = measured[name];
  const a = aligned[name];
  const transform = {
    scale: fit * a.scale,
    tx: fit * a.tx + shift.x,
    ty: fit * a.ty + shift.y,
  };

  const { webp } = await cutter.cut(png, TARGET, transform);
  fs.writeFileSync(path.join(OUT, `${name}.webp`), webp);
  bytes += webp.length;
  console.log(
    `  ${name}.webp (${(webp.length / 1024).toFixed(0)} KB, ` +
      `scaled ${transform.scale.toFixed(3)}, ` +
      `moved ${transform.tx.toFixed(0)},${transform.ty.toFixed(0)})`
  );
}
await cutter.close();

console.log(`\n${(bytes / 1024).toFixed(0)} KB written to public/images/mascot/.`);
