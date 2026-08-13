/**
 * Every positional form of one letter, side by side, to be looked at.
 *
 * "Is the initial form of mim right?" is not a question anybody can answer by
 * reading JSON, and it is not one the test suite can answer either — the tests
 * check that a form exists and has ink, which is a different claim from it
 * being the correct shape. This draws them so a person can judge.
 *
 * Two things it does that a naive render does not, both learned by getting it
 * wrong first:
 *
 *   - **One scale for all four.** Fitting each glyph to its own bounding box
 *     makes initial mim — a small loop on the line — look enormous beside the
 *     isolated form, and the first version of this picture had me thinking the
 *     font was broken. They share a viewBox now.
 *   - **The baseline is drawn.** Half of what distinguishes these forms is
 *     where they sit: isolated and final mim hang a long tail below the line,
 *     initial and medial sit on it. Without the line that is invisible.
 *
 * Underneath each is the same letter set by the system's own Urdu font, joined
 * with ZWJ the same way the baker asks for the form. That is the reference to
 * check ours against.
 *
 * Usage: node tools/preview-forms.mjs mim [out.png]
 */
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
    // One viewBox for all of them, spanning every form's extremes, so they are
    // drawn to a common scale and share a baseline. Fitting each glyph to its
    // own bbox makes a small initial form look enormous next to a tall
    // isolated one, which is an artefact of the picture and not of the font.
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
