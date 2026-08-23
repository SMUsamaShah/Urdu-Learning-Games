/**
 * Every menu tile on one sheet.
 *
 * The tiles are drawn in code now (src/lib/tile-faces.js), and the only
 * question that matters about a drawing — does a three-year-old look at it and
 * know which game it is — cannot be asked from a test. So this puts all
 * twenty-five side by side at the size they are actually shown at, which is the
 * one view where a tile that is muddy, or that looks like the tile next to it,
 * is obvious.
 *
 * Drawn through the app's own module rather than reimplemented here, so the
 * sheet cannot drift from the menu.
 *
 * Usage: npm run dev &  then  node tools/preview-tiles.mjs [out.png] [baseUrl]
 */

import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';
import { launchOptions } from './browser.mjs';

const OUT = process.argv[2] || 'screenshots/tiles.png';
const BASE = process.argv[3] || 'http://localhost:5173';

/** The menu's tile size at 1280×720, which is what these have to work at. */
const TILE = { width: 234, height: 244 };
const COLUMNS = 7;

const browser = await chromium.launch(launchOptions());
const page = await browser.newPage({ viewport: { width: 1400, height: 900 }, deviceScaleFactor: 1 });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));

await page.goto(BASE, { waitUntil: 'networkidle' });

const drew = await page.evaluate(
  async ([tile, columns]) => {
    const content = await import('/src/lib/content.js');
    await content.loadGlyphs();
    const { GAMES, artName } = await import('/src/lib/games.js');
    // Through the app's own painter, not a copy of it. See tilePanel().
    const { paintTilePanel, tilePanel } = await import('/src/lib/game-tile.js');
    const manifest = (await import('/content/tiles.json')).default;

    // The generated pictures, decoded here rather than through Phaser: this
    // sheet has no scene and no loader, and the painter takes the picture as an
    // argument precisely so both callers can find it their own way.
    const pictures = {};
    await Promise.all(
      Object.entries(manifest.tiles ?? {}).map(async ([name, file]) => {
        const image = new Image();
        image.src = `/${file}`;
        try {
          await image.decode();
          pictures[name] = image;
        } catch {
          /* a tile with no picture falls back to its drawing, which is the point */
        }
      })
    );

    // Every game, and that is now every tile: the spelling group and the "more
    // games" door are both gone, so there are no tiles left that are not games.
    const shown = GAMES;
    const rows = Math.ceil(shown.length / columns);
    const gap = 18;
    const pad = 24;

    const canvas = document.createElement('canvas');
    canvas.id = 'sheet';
    const scale = 2;
    canvas.width = (pad * 2 + columns * tile.width + (columns - 1) * gap) * scale;
    canvas.height = (pad * 2 + rows * tile.height + (rows - 1) * gap) * scale;
    canvas.style.width = `${canvas.width / scale}px`;
    document.body.replaceChildren(canvas);
    document.body.style.margin = '0';

    const ctx = canvas.getContext('2d');
    ctx.scale(scale, scale);
    ctx.fillStyle = '#fdf3e3';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const panel = tilePanel(tile.width, tile.height);

    const missing = [];
    shown.forEach((game, i) => {
      const x = pad + (i % columns) * (tile.width + gap) + tile.width / 2;
      const y = pad + Math.floor(i / columns) * (tile.height + gap) + tile.height / 2;
      ctx.save();
      ctx.translate(x, y);
      ctx.fillStyle = `#${(game.color >>> 0).toString(16).padStart(6, '0')}`;
      ctx.beginPath();
      ctx.roundRect(-tile.width / 2, -tile.height / 2, tile.width, tile.height, 26);
      ctx.fill();
      if (!paintTilePanel(ctx, game, panel, pictures[artName(game)] ?? null)) {
        missing.push(artName(game));
      }
      ctx.restore();
    });
    return {
      count: shown.length,
      missing,
      drawn: shown.filter((game) => !pictures[artName(game)]).map((game) => artName(game)),
      width: canvas.width / scale,
      height: canvas.height / scale,
    };
  },
  [TILE, COLUMNS]
);

// The sheet is wider and taller than any sensible window, and an element
// screenshot is still cropped to the viewport, so the window is grown to fit it.
await page.setViewportSize({ width: Math.ceil(drew.width), height: Math.ceil(drew.height) });
fs.mkdirSync(path.dirname(OUT), { recursive: true });
await page.locator('#sheet').screenshot({ path: OUT });
await browser.close();

console.log(`${drew.count} tiles → ${OUT}`);
if (drew.drawn.length) console.log(`falling back to the drawing: ${drew.drawn.join(', ')}`);
if (drew.missing.length) console.log(`no drawing for: ${drew.missing.join(', ')}`);
for (const error of errors) console.log(`console: ${error}`);
