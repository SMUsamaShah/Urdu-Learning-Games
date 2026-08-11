/**
 * Proves the app really runs with the network switched off.
 *
 * The static tests in tests/pwa.test.mjs check the precache list looks right.
 * This checks the thing that actually matters: install the service worker, cut
 * the network, reload, and see whether the app still starts and still speaks.
 *
 * Serves from a project subpath, matching how GitHub Pages hosts it, because
 * scope and start_url bugs only appear off the domain root.
 *
 * Usage: npm run build && node tools/verify-offline.mjs
 */

import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';
import { launchOptions } from './browser.mjs';
import { ROOT } from './audio-keys.mjs';

const PORT = 4177;
const SUBPATH = '/Urdu-Learning-Games/';
const URL_ = `http://localhost:${PORT}${SUBPATH}`;

const fail = (msg) => {
  console.error('FAIL: ' + msg);
  process.exitCode = 1;
};
const step = (msg) => process.stderr.write(`· ${msg}\n`);

if (!fs.existsSync(path.join(ROOT, 'dist', 'sw.js'))) {
  console.error('No dist/sw.js — run `npm run build` first.');
  process.exit(1);
}

const audioManifest = JSON.parse(
  fs.readFileSync(path.join(ROOT, 'content', 'audio.json'), 'utf8')
);
const clipKeys = Object.keys(audioManifest.clips);

const watchdog = setTimeout(() => {
  console.error('FAIL: timed out after 120s');
  process.exit(1);
}, 120000);
watchdog.unref();

step('starting preview server');
const server = spawn(
  'npx',
  ['vite', 'preview', '--port', String(PORT), '--base', SUBPATH],
  { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'] }
);
process.on('exit', () => server.kill());
for (const s of ['SIGINT', 'SIGTERM', 'SIGHUP']) process.on(s, () => process.exit(1));
await new Promise((resolve) => {
  server.stdout.on('data', (d) => String(d).includes('Local') && resolve());
  setTimeout(resolve, 6000);
});

const browser = await chromium.launch(launchOptions());
const context = await browser.newContext({ viewport: { width: 1180, height: 820 } });
const page = await context.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));

step('first load, installing the service worker');
await page.goto(URL_, { waitUntil: 'networkidle' });
await page.waitForFunction(() => window.__game?.scene.isActive('Home'), null, {
  timeout: 20000,
});

const swState = await page.evaluate(async () => {
  const reg = await navigator.serviceWorker.ready;
  return reg.active?.state ?? 'none';
});
if (swState !== 'activated') fail(`service worker state is "${swState}"`);
else step(`service worker ${swState}`);

// Wait for precaching to finish before cutting the network. `ready` resolves
// on activation, which can be before the last asset lands in the cache.
step('waiting for the precache to fill');
const cached = await page.evaluate(async (expected) => {
  const deadline = Date.now() + 30000;
  while (Date.now() < deadline) {
    const names = await caches.keys();
    const urls = [];
    for (const name of names) {
      const cache = await caches.open(name);
      for (const req of await cache.keys()) urls.push(req.url);
    }
    const have = expected.every((p) => urls.some((u) => u.includes(p)));
    if (have && urls.length > 5) return urls;
    await new Promise((r) => setTimeout(r, 500));
  }
  return null;
}, ['index.html', 'glyphs', 'audio', ...clipKeys.map((k) => audioManifest.clips[k])]);

if (!cached) {
  fail('precache did not fill within 30s');
} else {
  step(`${cached.length} entries cached`);
  for (const clip of clipKeys) {
    const p = audioManifest.clips[clip];
    if (!cached.some((u) => u.includes(p))) fail(`${clip} (${p}) never reached the cache`);
  }
}

// -------------------------------------------------------------- offline

step('going offline and reloading');
await context.setOffline(true);
errors.length = 0;

await page.reload({ waitUntil: 'domcontentloaded' });
const started = await page
  .waitForFunction(() => window.__game?.scene.isActive('Home'), null, { timeout: 20000 })
  .then(() => true)
  .catch(() => false);

if (!started) fail('the app did not start offline');
else step('app started offline');

const stats = await page.evaluate(() => window.__audio.audioStats());
if (!stats || stats.expected === 0) fail('audio manifest was not available offline');
else step(`audio manifest offline: ${JSON.stringify(stats)}`);

// Glyphs came from cache too, or nothing Urdu would draw.
const glyphOk = await page.evaluate(
  () => Boolean(window.__game.scene.getScene('Home'))
);
if (!glyphOk) fail('Home scene missing offline');

if (clipKeys.length > 0) {
  step('playing a clip offline');
  const played = await page.evaluate((key) => window.__audio.play(key), clipKeys[0]);
  if (played !== true) fail(`play("${clipKeys[0]}") returned ${played} while offline`);
  else step(`played ${clipKeys[0]} from cache`);
} else {
  step('no recordings present, skipping offline playback check');
}

await page.screenshot({
  path: process.argv[2] || path.join(ROOT, 'offline-check.png'),
});

if (errors.length) {
  for (const e of errors) console.error('  console: ' + e);
  fail(`${errors.length} console error(s) while offline`);
}

await browser.close();
clearTimeout(watchdog);
console.log(process.exitCode ? 'offline verification FAILED' : 'offline verification passed');
process.exit(process.exitCode ?? 0);
