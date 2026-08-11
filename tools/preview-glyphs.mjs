/**
 * Renders baked glyphs to a PNG contact sheet so they can be eyeballed.
 *
 * The baker cannot tell you whether the output looks like Urdu. This can.
 * Run it after any change to bake-glyphs.mjs and actually look at the result:
 * a y-flip mistake, a dropped mark glyph or a missing GPOS offset all produce
 * valid-looking JSON and obviously broken letters.
 *
 * Usage: node tools/preview-glyphs.mjs [outfile.png]
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { launchOptions } from './browser.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CONTENT = path.join(ROOT, 'content');
const OUT = process.argv[2] || path.join(ROOT, 'preview-glyphs.png');

const read = (f) => JSON.parse(fs.readFileSync(path.join(CONTENT, f), 'utf8'));

const letters = read('letters.json').letters;
const words = read('words.json').words;
const glyphs = read('glyphs.json');

/** Scales a baked glyph to fit a box, preserving aspect ratio. */
function svgFor(glyph, boxW, boxH) {
  if (!glyph.d) return '';
  const [x, y, w, h] = glyph.bbox;
  const pad = 0.08 * Math.max(w, h);
  return `<svg viewBox="${x - pad} ${y - pad} ${w + pad * 2} ${h + pad * 2}"
    width="${boxW}" height="${boxH}" preserveAspectRatio="xMidYMid meet">
    <path d="${glyph.d}" fill="#1a1a2e"/></svg>`;
}

const cells = [];
for (const l of letters) {
  const forms = Object.keys(glyphs.letters[l.id]);
  const boxes = forms
    .map((f) => {
      const g = glyphs.letters[l.id][f];
      return `<div class="form"><div class="box">${svgFor(g, 92, 92)}</div>
        <span>${f}</span></div>`;
    })
    .join('');
  cells.push(`<div class="cell">
    <div class="hdr"><b>${l.char}</b> ${l.roman}
      <em>joins ${l.joins} &middot; ${forms.length} form${forms.length > 1 ? 's' : ''}</em></div>
    <div class="forms">${boxes}</div></div>`);
}

const wordCells = words
  .map((w) => {
    const g = glyphs.words[w.id];
    return `<div class="wcell"><div class="wbox">${svgFor(g, 200, 110)}</div>
      <span>${w.roman} &middot; ${w.gloss}</span></div>`;
  })
  .join('');

const html = `<!doctype html><meta charset="utf-8"><style>
  body{font:13px system-ui;background:#fff;margin:0;padding:24px;color:#333}
  h2{margin:28px 0 12px;font-size:16px}
  .grid{display:grid;grid-template-columns:repeat(3,1fr);gap:14px}
  .cell{border:1px solid #dfe3ea;border-radius:8px;padding:10px;background:#fbfcfe}
  .hdr{margin-bottom:8px;font-size:13px}
  .hdr b{font-size:20px;margin-left:4px}
  .hdr em{color:#8a94a6;font-style:normal;float:right;font-size:11px}
  .forms{display:flex;gap:6px}
  .form{flex:1;text-align:center}
  .box{height:92px;display:flex;align-items:center;justify-content:center;
       background:#fff;border:1px solid #eef1f5;border-radius:6px}
  .form span{font-size:10px;color:#8a94a6}
  .wgrid{display:grid;grid-template-columns:repeat(4,1fr);gap:12px}
  .wcell{text-align:center;border:1px solid #dfe3ea;border-radius:8px;
         padding:8px;background:#fbfcfe}
  .wbox{height:110px;display:flex;align-items:center;justify-content:center}
  .wcell span{font-size:11px;color:#5a6472}
</style>
<h2>Letters — all positional forms</h2>
<div class="grid">${cells.join('')}</div>
<h2>Words — shaped whole</h2>
<div class="wgrid">${wordCells}</div>`;

const browser = await chromium.launch(launchOptions());
const page = await browser.newPage({ viewport: { width: 1180, height: 900 }, deviceScaleFactor: 2 });
await page.setContent(html);
await page.screenshot({ path: OUT, fullPage: true });
await browser.close();
console.log(`Wrote ${OUT}`);
