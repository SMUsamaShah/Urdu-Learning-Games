import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { studioLayout, studioPlaces } from '../src/lib/studio-layout.js';
import { createServer } from 'vite';

test('six large tiles fit the supported landscape widths without covering the left column', () => {
  for (const width of [1280, 1440, 1600, 1728]) {
    const layout = studioLayout(width);
    const places = studioPlaces(layout);
    assert.equal(places.length, 6);
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

test('the configured character and every studio object are real WebP files with alpha', () => {
  const config = JSON.parse(fs.readFileSync(new URL('../content/characters.json', import.meta.url)));
  const files = [config.characters[config.default].image,
    ...['goat', 'grapes', 'apple', 'pencil', 'magnifier', 'puzzle', 'balloons'].map(n => `images/studio/${n}.webp`)];
  for (const file of files) {
    const bytes = fs.readFileSync(new URL('../public/' + file, import.meta.url));
    assert.equal(bytes.toString('ascii', 0, 4), 'RIFF', file);
    assert.equal(bytes.toString('ascii', 8, 12), 'WEBP', file);
    assert.equal(bytes.toString('ascii', 12, 16), 'VP8X', file);
    assert.ok(bytes[20] & 0x10, `${file} lost its transparency`);
  }
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
