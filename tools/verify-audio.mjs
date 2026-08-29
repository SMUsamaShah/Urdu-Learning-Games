/* Proves the whole audio chain works, end to end, with no microphone. */

import { execFileSync } from 'node:child_process';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fail, homeIsUp, openApp, step } from './harness.mjs';
import { RECORDED_DIR, ROOT, expectedClips, resolveClip } from './audio-keys.mjs';

const APP = process.argv[2] || 'http://localhost:5173';
const STUDIO_PORT = 5198;
const CLIP = expectedClips()[0]; // letter/alif/name

if (resolveClip(CLIP.slug)) {
  console.log(`Skipping: ${CLIP.slug} is already recorded.`);
  process.exit(0);
}

const rebuildManifest = () =>
  execFileSync(process.execPath, ['tools/build-audio-manifest.mjs'], {
    cwd: ROOT,
    encoding: 'utf8',
  }).trim();

const cleanup = () => {
  for (const f of fs.readdirSync(RECORDED_DIR)) {
    if (f.startsWith(CLIP.slug + '.')) fs.unlinkSync(path.join(RECORDED_DIR, f));
  }
  try {
    rebuildManifest();
  } catch {
    /* best effort */
  }
};
process.on('exit', cleanup);
for (const s of ['SIGINT', 'SIGTERM', 'SIGHUP']) process.on(s, () => process.exit(1));

step('starting studio server');
const server = spawn(process.execPath, ['tools/record-studio/server.mjs'], {
  cwd: ROOT,
  env: { ...process.env, PORT: String(STUDIO_PORT) },
  stdio: ['ignore', 'pipe', 'inherit'],
});
await new Promise((resolve) => {
  server.stdout.on('data', (d) => String(d).includes('Recording studio') && resolve());
  setTimeout(resolve, 4000);
});

const { newPage, finish } = await openApp({
  name: 'audio',
  timeoutMs: 120000,
  open: false,
  args: [
    '--use-fake-device-for-media-stream',
    '--use-fake-ui-for-media-stream',
    // Lets the game start audio without a real user gesture, which a headless run cannot produce.
    '--autoplay-policy=no-user-gesture-required',
  ],
});

step('recording a clip through the studio');
const studio = await newPage();
await studio.context().grantPermissions(['microphone'], {
  origin: `http://localhost:${STUDIO_PORT}`,
});
await studio.goto(`http://localhost:${STUDIO_PORT}/`, { waitUntil: 'domcontentloaded' });
await studio.waitForFunction(() => window.__studio?.state.clips.length > 0);
await studio.evaluate(() => window.__studio.toggleRecording());
await studio.waitForTimeout(900);
await studio.evaluate(() => window.__studio.toggleRecording());
await studio.waitForFunction(() => window.__studio.state.take !== null);
await studio.evaluate(() => window.__studio.saveTake());
await studio.waitForFunction(() => window.__studio.state.take === null);
await studio.close();
server.kill();

const resolved = resolveClip(CLIP.slug);
if (!resolved) {
  fail('studio did not write a file');
  await finish();
}
step(`wrote public/${resolved.path}`);

step('rebuilding manifest');
console.log('  ' + rebuildManifest());

step('loading the app');
// Use domcontentloaded because the dev server keeps an HMR socket open.
const page = await newPage();
await page.goto(APP, { waitUntil: 'domcontentloaded' });
await homeIsUp(page);

const stats = await page.evaluate(() => window.__audio.audioStats());
console.log(`  manifest seen by app: ${JSON.stringify(stats)}`);
if (stats.recorded < 1) fail('app did not see the new recording in its manifest');

const known = await page.evaluate((key) => window.__audio.hasClip(key), CLIP.key);
if (!known) fail(`hasClip("${CLIP.key}") is false`);

step('playing the clip');
// play() resolves true only after fetch + decodeAudioData + the source actually reaching its end.
const played = await page.evaluate(
  (key) => window.__audio.play(key),
  CLIP.key
);
if (played !== true) fail(`play("${CLIP.key}") returned ${played}`);
else console.log(`  played ${CLIP.key} to completion`);

// A clip with no recording must be silent rather than an error.
const silent = await page.evaluate(() => window.__audio.play('letter/be/sound'));
if (silent !== false) fail('a missing clip should resolve false, not throw');
else console.log('  missing clip resolved silently, as intended');

await finish();
