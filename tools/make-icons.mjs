/**
 * Generates the app icons from the baked Nastaliq outlines.
 *
 * The icon is the word اردو drawn from content/glyphs.json — the same pipeline
 * that draws every letter in the game — so the icon can never drift from the
 * typography, and there is no hand-made asset to keep in sync.
 *
 * Rendering goes through Chromium (already present for the Playwright checks)
 * rather than adding an image library as a dependency.
 *
 * Usage: npm run icons
 */

import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';
import { launchOptions } from './browser.mjs';
import { CONTENT_DIR, ROOT } from './audio-keys.mjs';

const OUT = path.join(ROOT, 'public', 'icons');
const BG = '#1b2440';
const INK = '#ffc857';

const glyphs = JSON.parse(fs.readFileSync(path.join(CONTENT_DIR, 'glyphs.json'), 'utf8'));
const glyph = glyphs.ui['icon-word'];
if (!glyph?.d) {
  throw new Error('No baked glyph for ui/icon-word. Run `npm run bake` first.');
}

/**
 * @param {number} size
 * @param {number} scale fraction of the canvas the artwork may occupy.
 *   Maskable icons are cropped to a circle by the launcher, so their content
 *   has to sit inside the middle 80% or it loses its edges on some devices.
 * @param {boolean} round apple-touch icons are squares that iOS rounds itself.
 */
function iconHtml(size, scale, { radius = 0 } = {}) {
  const [x, y, w, h] = glyph.bbox;
  const box = size * scale;
  // Fit the glyph's bounding box inside `box`, preserving aspect ratio.
  const k = Math.min(box / w, box / h);
  const drawW = w * k;
  const drawH = h * k;

  return `<!doctype html><meta charset="utf-8"><style>
    html,body{margin:0;padding:0;background:transparent}
    .icon{width:${size}px;height:${size}px;background:${BG};
          border-radius:${radius}px;display:flex;
          align-items:center;justify-content:center}
  </style>
  <div class="icon">
    <svg width="${drawW}" height="${drawH}"
         viewBox="${x} ${y} ${w} ${h}" preserveAspectRatio="xMidYMid meet">
      <path d="${glyph.d}" fill="${INK}"/>
    </svg>
  </div>`;
}

const ICONS = [
  // Standard icons: a little breathing room, but they are shown as-is.
  { file: 'pwa-192x192.png', size: 192, scale: 0.68 },
  { file: 'pwa-512x512.png', size: 512, scale: 0.68 },
  // Maskable: the launcher may crop to a circle, so keep well inside.
  { file: 'maskable-512x512.png', size: 512, scale: 0.5 },
  // iOS applies its own rounding and never uses maskable.
  { file: 'apple-touch-icon.png', size: 180, scale: 0.64 },
];

fs.mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch(launchOptions());
for (const { file, size, scale } of ICONS) {
  const page = await browser.newPage({ viewport: { width: size, height: size } });
  await page.setContent(iconHtml(size, scale));
  await page.screenshot({ path: path.join(OUT, file), omitBackground: true });
  await page.close();
  console.log(`  ${file} (${size}×${size})`);
}
await browser.close();
console.log(`Icons written to public/icons/`);
