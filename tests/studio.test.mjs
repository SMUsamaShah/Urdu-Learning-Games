import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import { studioLayout, studioPlaces } from '../src/lib/studio-layout.js';
import { imagePlacement } from '../src/lib/image-button.js';
import { createServer } from 'vite';

test('six large tiles fit the supported landscape widths without covering the left column', () => {
  for (const width of [1280, 1440, 1600, 1728]) {
    const layout = studioLayout(width);
    const places = studioPlaces(layout);
    assert.equal(places.length, 6);
    assert.equal(layout.grid.tileWidth, layout.grid.tileHeight, 'complete artwork must not be cropped');
    for (const p of places) {
      const left = p.x - layout.grid.tileWidth / 2;
      const right = p.x + layout.grid.tileWidth / 2;
      const bottom = p.y + layout.grid.tileHeight / 2;
      assert.ok(left >= layout.chalo.x + layout.chalo.width / 2 + 20);
      assert.ok(right <= width - 28 + 0.01);
      assert.ok(p.y - layout.grid.tileHeight / 2 >= 100);
      assert.ok(bottom < layout.dotsY - 35);
    }
    assert.ok(places[0].x > places[1].x && places[1].x > places[2].x, 'tiles read right to left');
    assert.equal(places[0].x, places[3].x);
    assert.ok(places[3].y > places[0].y + layout.grid.tileHeight);
    assert.ok(layout.character.y < layout.chalo.y - layout.chalo.height / 2);
  }
});

test('six-tile paging preserves enabled games and saved ordering', async () => {
  // The application imports JSON through Vite, so exercise the real modules through that loader.
  const server = await createServer({
    root: new URL('..', import.meta.url).pathname,
    server: { middlewareMode: true, host: '127.0.0.1', hmr: false }, appType: 'custom',
  });
  const { PER_PAGE, menuGames, pagesOf, move, resetMenu } = await server.ssrLoadModule('/src/lib/menu.js');
  const { setEnabled } = await server.ssrLoadModule('/src/lib/enabled.js');
  assert.equal(PER_PAGE, 6);
  resetMenu();
  try {
    const original = menuGames().map(g => g.scene);
    assert.equal(new Set(pagesOf(menuGames()).flat().map(g => g.scene)).size, original.length);
    assert.ok(pagesOf(menuGames()).every(page => page.length <= 6));
    const disabled = original[1], moved = original.at(-1);
    setEnabled('game', disabled, false);
    move(moved, 0);
    const pages = pagesOf(menuGames());
    assert.equal(pages[0][0].scene, moved);
    assert.ok(!pages.flat().some(g => g.scene === disabled));
    assert.equal(pages.flat().length, original.length - 1);
  } finally { resetMenu(); await server.close(); }
});

test('the configured character and complete Chalo button retain transparency', () => {
  const config = JSON.parse(fs.readFileSync(new URL('../content/characters.json', import.meta.url)));
  const manifest = JSON.parse(fs.readFileSync(new URL('../content/studio-tiles.json', import.meta.url)));
  const files = [config.characters[config.default].image, manifest.chalo.file];
  for (const file of files) {
    const bytes = fs.readFileSync(new URL('../public/' + file, import.meta.url));
    assert.equal(bytes.toString('ascii', 0, 4), 'RIFF', file);
    assert.equal(bytes.toString('ascii', 8, 12), 'WEBP', file);
    assert.equal(bytes.toString('ascii', 12, 16), 'VP8X', file);
    assert.ok(bytes[20] & 0x10, `${file} lost its transparency`);
  }
});

test('every game has its own complete generated tile image', () => {
  const source = fs.readFileSync(new URL('../src/lib/games.js', import.meta.url), 'utf8');
  const games = [...source.matchAll(/^\s*scene: '(\w+)',$/gm)].map(m => m[1]).sort();
  const manifest = JSON.parse(fs.readFileSync(new URL('../content/studio-tiles.json', import.meta.url)));
  assert.deepEqual(Object.keys(manifest.tiles).sort(), games);
  const hashes = new Set();
  const files = new Set();
  for (const art of Object.values(manifest.tiles)) {
    assert.ok(!files.has(art.file), `two games share ${art.file}`); files.add(art.file);
    const bytes = fs.readFileSync(new URL('../public/' + art.file, import.meta.url));
    assert.equal(bytes.toString('ascii', 0, 4), 'RIFF', art.file);
    assert.equal(bytes.toString('ascii', 8, 12), 'WEBP', art.file);
    assert.ok(bytes.length > 10000, `${art.file} is not a complete illustration`);
    const hash = createHash('sha256').update(bytes).digest('hex');
    assert.ok(!hashes.has(hash), `duplicate artwork: ${art.file}`); hashes.add(hash);
  }
});

test('image buttons preserve illustration proportions and transparent button shapes', () => {
  const square = imagePlacement(768, 768, 246, 246);
  assert.deepEqual(square, { x: 0, y: 0, width: 246, height: 246 });
  const button = imagePlacement(1152, 412, 370, 134, 'contain');
  assert.equal(button.width, 370);
  assert.ok(button.height <= 134 && button.y >= 0);
  assert.ok(Math.abs(button.width / button.height - 1152 / 412) < 1e-12);
  const landscape = imagePlacement(1024, 768, 246, 246, 'contain');
  assert.equal(landscape.width, 246);
  assert.equal(landscape.height, 184.5);
  assert.equal(landscape.y, 30.75);
});

test('the bold wordmarks retain the exact Urdu labels', () => {
  const data = JSON.parse(fs.readFileSync(new URL('../content/brand-glyphs.json', import.meta.url)));
  assert.equal(data.labels.title.text, 'اردو کھیل');
  assert.equal(data.labels.chalo.text, 'چلو');
  for (const glyph of Object.values(data.labels)) {
    assert.ok(glyph.d.length > 100);
    assert.ok(glyph.bbox[2] > 0 && glyph.bbox[3] > 0);
  }
});
