/* Every generated prop on a sheet, over the colours it will actually sit on. */

import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';
import { launchOptions } from './browser.mjs';
import { CONTENT_DIR, ROOT } from './audio-keys.mjs';

const manifestFile = path.join(CONTENT_DIR, 'props.json');
if (!fs.existsSync(manifestFile)) {
  console.error('No content/props.json. Run `npm run props` first.');
  process.exit(1);
}
const props = JSON.parse(fs.readFileSync(manifestFile, 'utf8')).props ?? {};
const names = Object.keys(props).sort();
if (!names.length) {
  console.error('content/props.json is empty.');
  process.exit(1);
}

/* Taken off the backdrops: pale sky, meadow green, path sand, and the tell. */
const GROUNDS = ['#bfe3f5', '#8fc75f', '#e8cf9a', '#ff00c8'];

const BASE = process.argv[2] || 'http://localhost:5173';

const browser = await chromium.launch(launchOptions());
const page = await browser.newPage();
await page.goto(BASE, { waitUntil: 'networkidle' });

const shot = await page.evaluate(
  async ([entries, grounds]) => {
    const CELL = 260;
    const PAD = 16;
    const LABEL = 22;
    const cols = grounds.length;
    const rows = entries.length;

    const canvas = document.createElement('canvas');
    canvas.width = cols * CELL + PAD * 2;
    canvas.height = rows * (CELL + LABEL) + PAD * 2;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#1a1d28';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    for (let row = 0; row < rows; row++) {
      const [name, file] = entries[row];
      const image = new Image();
      image.src = `/${file}`;
      await image.decode();

      const top = PAD + row * (CELL + LABEL);
      ctx.fillStyle = '#eef1f6';
      ctx.font = '15px sans-serif';
      ctx.textBaseline = 'middle';
      ctx.fillText(`${name}  ${image.width}x${image.height}`, PAD + 2, top + LABEL / 2);

      for (let col = 0; col < cols; col++) {
        const left = PAD + col * CELL;
        const cellTop = top + LABEL;
        ctx.fillStyle = grounds[col];
        ctx.fillRect(left, cellTop, CELL - 4, CELL - 4);

        // Preserve the whole prop; remove only its background.
        const scale = Math.min((CELL - 40) / image.width, (CELL - 40) / image.height);
        const w = image.width * scale;
        const h = image.height * scale;
        ctx.drawImage(image, left + (CELL - 4 - w) / 2, cellTop + (CELL - 4 - h) / 2, w, h);
      }
    }

    const blob = await new Promise((r) => canvas.toBlob(r, 'image/png'));
    const buffer = new Uint8Array(await blob.arrayBuffer());
    return [...buffer];
  },
  [names.map((name) => [name, props[name].file]), GROUNDS]
);

const out = path.join(ROOT, 'screenshots', 'props-sheet.png');
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, Buffer.from(shot));
await browser.close();

console.log(`${names.length} props → screenshots/props-sheet.png`);
console.log('The magenta column is the one to read: a rim there is a halo.');
