/* Checks the built service worker really can run the app with no network. */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from '../tools/audio-keys.mjs';

const DIST = path.join(ROOT, 'dist');
const swPath = path.join(DIST, 'sw.js');
const built = fs.existsSync(swPath);

/* URLs baked into the generated service worker's precache list. */
function precachedUrls() {
  const sw = fs.readFileSync(swPath, 'utf8');
  return new Set([...sw.matchAll(/url:"([^"]+)"/g)].map((m) => m[1]));
}

describe('pwa', { skip: built ? false : 'no dist/ — run `npm run build`' }, () => {
  test('the web app manifest describes an installable kids app', () => {
    const manifest = JSON.parse(
      fs.readFileSync(path.join(DIST, 'manifest.webmanifest'), 'utf8')
    );
    assert.equal(manifest.display, 'fullscreen');
    assert.deepEqual(manifest.display_override, ['fullscreen', 'standalone']);
    assert.equal(manifest.id, '.');
    assert.equal(manifest.lang, 'ur');
    assert.equal(manifest.dir, 'rtl');

    // Relative, so installing from a GitHub Pages project subpath scopes to
    // that subpath instead of the domain root.
    assert.ok(!manifest.start_url.startsWith('/'), 'start_url must be relative');
    assert.ok(!manifest.scope.startsWith('/'), 'scope must be relative');

    const sizes = manifest.icons.map((i) => i.sizes);
    assert.ok(sizes.includes('192x192'));
    assert.ok(sizes.includes('512x512'));
    assert.ok(
      manifest.icons.some((i) => i.purpose === 'maskable'),
      'needs a maskable icon or Android crops the artwork'
    );
    for (const icon of manifest.icons) {
      assert.ok(
        fs.existsSync(path.join(DIST, icon.src)),
        `manifest points at missing icon ${icon.src}`
      );
    }
  });

  test('the app shell is precached', () => {
    const urls = precachedUrls();
    assert.ok(urls.has('index.html'), 'index.html not precached');
    assert.ok(
      [...urls].some((u) => u.endsWith('.js') && u.startsWith('assets/')),
      'the JS bundle is not precached'
    );
    assert.ok(
      [...urls].some((u) => u.includes('glyphs') && u.endsWith('.json')),
      'glyphs.json is not precached — no Urdu would render offline'
    );
    assert.ok(
      [...urls].some((u) => u.includes('audio') && u.endsWith('.json')),
      'audio.json is not precached'
    );
  });

  test('every recorded clip is precached', () => {
    // Include non-default asset types such as .webm in the precache.
    const manifest = JSON.parse(
      fs.readFileSync(path.join(ROOT, 'content', 'audio.json'), 'utf8')
    );
    const clipPaths = Object.values(manifest.clips);
    if (clipPaths.length === 0) return; // nothing recorded yet

    const urls = precachedUrls();
    for (const clip of clipPaths) {
      assert.ok(
        urls.has(clip),
        `${clip} is in the audio manifest but not precached — it would be ` +
          `silent offline. Check workbox.globPatterns in vite.config.js.`
      );
    }
  });

  test('every word picture is precached', () => {
    // Same trap as the recordings: Workbox's default glob has no .webp either,
    // so the pictures would load fine online and leave empty cards offline.
    const images = JSON.parse(
      fs.readFileSync(path.join(ROOT, 'content', 'images.json'), 'utf8')
    );
    const files = Object.values(images.words ?? {});
    if (files.length === 0) return;

    const urls = precachedUrls();
    for (const file of files) {
      assert.ok(
        urls.has(file),
        `${file} is in the image manifest but not precached — the card would ` +
          `be empty offline. Check workbox.globPatterns in vite.config.js.`
      );
    }
  });

  test('no precache entry is missing from disk', () => {
    for (const url of precachedUrls()) {
      assert.ok(
        fs.existsSync(path.join(DIST, url)),
        `precache lists ${url} but it is not in dist/`
      );
    }
  });
});
