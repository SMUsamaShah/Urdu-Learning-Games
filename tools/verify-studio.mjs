/**
 * End-to-end check of the recording studio, with no microphone involved.
 *
 * Chromium can synthesise a media stream and auto-grant permission, so the
 * whole chain is exercised for real: getUserMedia -> MediaRecorder -> POST ->
 * a file on disk -> the manifest picking it up. Nothing is mocked.
 *
 * Starts its own server, drives it, then deletes the clip it recorded so a
 * verification run never leaves a fake take in the repo.
 *
 * Usage: node tools/verify-studio.mjs [screenshot.png]
 */

import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';
import { launchOptions } from './browser.mjs';
import { RECORDED_DIR, ROOT, expectedClips, resolveClip } from './audio-keys.mjs';

const PORT = 5199;
const SHOT = process.argv[2];
const TEST_SLUG = expectedClips()[0].slug;

const fail = (msg) => {
  console.error('FAIL: ' + msg);
  process.exitCode = 1;
};

// Unbuffered progress, so a hang shows exactly which step it hung on.
const step = (msg) => process.stderr.write(`· ${msg}\n`);

// The whole check should take seconds. Anything longer is a hang, and dying
// loudly beats a background job that never returns.
const watchdog = setTimeout(() => {
  console.error('FAIL: timed out after 90s');
  process.exit(1);
}, 90000);
watchdog.unref();

// Refuse to clobber a real recording if one already exists for this clip.
const existing = resolveClip(TEST_SLUG);
if (existing) {
  console.log(`Skipping: ${TEST_SLUG} is already recorded (${existing.path}).`);
  process.exit(0);
}

const server = spawn(process.execPath, ['tools/record-studio/server.mjs'], {
  cwd: ROOT,
  env: { ...process.env, PORT: String(PORT) },
  stdio: ['ignore', 'pipe', 'inherit'],
});

const cleanup = () => {
  server.kill();
  for (const f of fs.readdirSync(RECORDED_DIR)) {
    if (f.startsWith(TEST_SLUG + '.')) {
      fs.unlinkSync(path.join(RECORDED_DIR, f));
      console.log(`cleaned up ${f}`);
    }
  }
};
process.on('exit', cleanup);
// A killed run must not leave its synthetic beep behind looking like a real
// recording. 'exit' alone does not fire on a signal.
for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP']) {
  process.on(signal, () => process.exit(1));
}

step('waiting for server');
await new Promise((resolve) => {
  server.stdout.on('data', (d) => String(d).includes('Recording studio') && resolve());
  setTimeout(resolve, 4000);
});

step('launching chromium');
const browser = await chromium.launch({
  ...launchOptions(),
  args: [
    ...launchOptions().args,
    // A synthetic microphone, and permission granted without a prompt.
    '--use-fake-device-for-media-stream',
    '--use-fake-ui-for-media-stream',
  ],
});

step('opening page');
const page = await browser.newPage({ viewport: { width: 1280, height: 820 }, deviceScaleFactor: 2 });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));

step('granting mic permission');
await page.context().grantPermissions(['microphone'], {
  origin: `http://localhost:${PORT}`,
});
step('navigating');
await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'networkidle' });
await page.waitForFunction(() => window.__studio?.state.clips.length > 0, null, {
  timeout: 15000,
});

const total = await page.evaluate(() => window.__studio.state.clips.length);
console.log(`studio loaded ${total} clips`);

// A prompt must actually render, otherwise the person recording sees nothing.
const glyphPath = await page.$eval('#glyph svg path', (el) => el.getAttribute('d')?.length ?? 0);
if (glyphPath < 50) fail('prompt glyph did not render');

// Record for a moment, stop, and save.
step('recording');
await page.evaluate(() => window.__studio.toggleRecording());
await page.waitForTimeout(900);
await page.evaluate(() => window.__studio.toggleRecording());
await page.waitForFunction(() => window.__studio.state.take !== null, null, { timeout: 10000 });

const takeBytes = await page.evaluate(() => window.__studio.state.take.blob.size);
console.log(`captured take: ${(takeBytes / 1024).toFixed(1)} KB`);
if (takeBytes < 500) fail('take is suspiciously small; MediaRecorder produced nothing');

if (SHOT) await page.screenshot({ path: SHOT });

step('saving');
await page.evaluate(() => window.__studio.saveTake());
await page.waitForFunction(() => window.__studio.state.take === null, null, { timeout: 10000 });

// The actual assertion: a real file, found the same way the app finds it.
const resolved = resolveClip(TEST_SLUG);
if (!resolved) {
  fail(`no file on disk for ${TEST_SLUG}`);
} else {
  const bytes = fs.statSync(path.join(ROOT, 'public', resolved.path)).size;
  console.log(`wrote public/${resolved.path} (${(bytes / 1024).toFixed(1)} KB, ${resolved.source})`);
  if (resolved.source !== 'recorded') fail('clip did not resolve as a recording');
}

if (errors.length) {
  for (const e of errors) console.error('  console: ' + e);
  fail(`${errors.length} console error(s)`);
}

step('closing');
await browser.close();
clearTimeout(watchdog);
console.log(process.exitCode ? 'studio verification FAILED' : 'studio verification passed');

// The spawned server holds the event loop open through its stdio pipe, so exit
// deliberately rather than waiting to be reaped. `cleanup` still runs on exit.
process.exit(process.exitCode ?? 0);
