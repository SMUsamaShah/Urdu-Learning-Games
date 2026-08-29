/* Every positional form of one letter, side by side, to be looked at. */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { launchOptions } from './browser.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const id = process.argv[2] ?? 'mim';
const out = process.argv[3] ?? `forms-${id}.png`;

const glyphs = JSON.parse(fs.readFileSync(`${ROOT}/content/glyphs.json`, 'utf8'));
const forms = glyphs.letters[id];
if (!forms) {
  console.error(`no letter "${id}"`);
  process.exit(1);
}

const browser = await chromium.launch(launchOptions());
const page = await browser.newPage({ viewport: { width: 1240, height: 480 } });
await page.setContent(`
  <style>
    body { margin: 0; background: #fff; font: 16px system-ui; }
    #row { display: flex; align-items: flex-end; }
    figure { flex: 1; margin: 0; padding: 20px 8px; text-align: center; }
    svg { height: 220px; }
    figcaption { color: #555; margin-top: 8px; }
    /* The reference: the same letter set by the system's own Urdu font. */
    .ref { font-size: 90px; color: #b23; direction: rtl; }
  </style>
  <div id="row"></div>`);

await page.evaluate(
  ([forms, upem, id]) => {
    // What each positional form should look like when the font joins it up.
    const JOINED = {
      isolated: (c) => c,
      initial: (c) => c + '‍',
      medial: (c) => '‍' + c + '‍',
      final: (c) => '‍' + c,
    };
    const CHAR = { mim: 'م', be: 'ب', ain: 'ع', he: 'ہ', kaf: 'ک' }[id] ?? '';

    const row = document.getElementById('row');
    // One viewBox for all of them, spanning every form's extremes, so they are drawn to a common scale and share a baseline.
    const all = Object.values(forms).map((g) => g.bbox);
    const minY = Math.min(...all.map((b) => b[1]));
    const maxY = Math.max(...all.map((b) => b[1] + b[3]));
    const maxW = Math.max(...all.map((b) => b[2]));
    const pad = Math.max(maxW, maxY - minY) * 0.12;

    for (const [name, glyph] of Object.entries(forms)) {
      const [x] = glyph.bbox;
      const fig = document.createElement('figure');
      fig.innerHTML =
        `<svg viewBox="${x - pad} ${minY - pad} ${maxW + pad * 2} ${maxY - minY + pad * 2}">` +
        `<line x1="${x - pad}" y1="0" x2="${x + maxW + pad}" y2="0" ` +
        `stroke="#d8dae4" stroke-width="${(maxY - minY) * 0.012}"/>` +
        `<path d="${glyph.d}" fill="#2b3047"/></svg>` +
        `<figcaption>${name}<br><span class="ref">${
          CHAR ? JOINED[name](CHAR) : ''
        }</span></figcaption>`;
      row.append(fig);
    }
    void upem;
  },
  [forms, glyphs.upem, id]
);

await page.waitForTimeout(400);
await page.screenshot({ path: out });
await browser.close();
console.log(`${id}: ${Object.keys(forms).join(', ')} -> ${out}`);
