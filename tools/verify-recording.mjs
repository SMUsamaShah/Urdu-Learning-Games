/**
 * Proves the device-local recording loop works end to end, with no microphone
 * and no hands.
 *
 * The chain being tested is the whole promise made to the user:
 *
 *   record in the app  →  stored on this device  →  overrides the built-in clip
 *     →  export to a zip  →  wiped device  →  import  →  plays again
 *     →  handed to the studio  →  lands in the repo
 *
 * Every link is the real one: the real parental gate, the real MediaRecorder
 * (against Chromium's synthetic audio device), the real IndexedDB, the real zip
 * writer, and the real studio server writing a real file.
 *
 * Starts its own dev server, and removes anything it wrote.
 *
 * Usage: npm run verify:recording
 */

import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';
import { launchOptions } from './browser.mjs';
import { RECORDED_DIR, ROOT, expectedClips, resolveClip } from './audio-keys.mjs';

const APP_PORT = 5199;
const STUDIO_PORT = 5196;
const APP = `http://localhost:${APP_PORT}`;
const CLIP = expectedClips()[0]; // letter/alif/name

const fail = (msg) => {
  console.error('FAIL: ' + msg);
  process.exitCode = 1;
};
const step = (msg) => process.stderr.write(`· ${msg}\n`);

if (resolveClip(CLIP.slug)) {
  console.log(`Skipping: ${CLIP.slug} is already recorded in the repo.`);
  process.exit(0);
}

const cleanup = () => {
  for (const f of fs.readdirSync(RECORDED_DIR)) {
    if (f.startsWith(CLIP.slug + '.')) fs.unlinkSync(path.join(RECORDED_DIR, f));
  }
};
process.on('exit', cleanup);
for (const s of ['SIGINT', 'SIGTERM', 'SIGHUP']) process.on(s, () => process.exit(1));

const watchdog = setTimeout(() => {
  console.error('FAIL: timed out after 180s');
  process.exit(1);
}, 180000);
watchdog.unref();

function serve(command, args, ready) {
  const child = spawn(command, args, { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'] });
  process.on('exit', () => child.kill());
  return new Promise((resolve) => {
    child.stdout.on('data', (d) => String(d).includes(ready) && resolve(child));
    setTimeout(() => resolve(child), 8000);
  });
}

step('starting dev server and studio');
await serve('npx', ['vite', '--port', String(APP_PORT), '--strictPort'], 'Local');
// The studio takes its port from the environment, so it is started directly
// rather than through the helper above.
const studio = spawn(process.execPath, ['tools/record-studio/server.mjs'], {
  cwd: ROOT,
  env: { ...process.env, PORT: String(STUDIO_PORT) },
  stdio: ['ignore', 'pipe', 'inherit'],
});
process.on('exit', () => studio.kill());
await new Promise((resolve) => {
  studio.stdout.on('data', (d) => String(d).includes('Recording studio') && resolve());
  setTimeout(resolve, 5000);
});

const base = launchOptions();
const browser = await chromium.launch({
  ...base,
  args: [
    ...base.args,
    '--use-fake-device-for-media-stream',
    '--use-fake-ui-for-media-stream',
  ],
});
const context = await browser.newContext({
  viewport: { width: 1180, height: 820 },
  acceptDownloads: true,
});
await context.grantPermissions(['microphone'], { origin: APP });

const page = await context.newPage();

// Watch what the page does with audio hardware. Two things caused real,
// user-reported stuttering and must not come back:
//
//   1. a second AudioContext — a second claim on the audio device
//   2. the microphone held open while playback is happening, which moves a
//      phone's audio path into its communications profile
await page.addInitScript(() => {
  window.__audioProbe = { contexts: [], streams: [] };
  const Ctor = window.AudioContext;
  window.AudioContext = class extends Ctor {
    constructor(...args) {
      super(...args);
      window.__audioProbe.contexts.push(this);
    }
  };
  const getUserMedia = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
  navigator.mediaDevices.getUserMedia = async (...args) => {
    const stream = await getUserMedia(...args);
    window.__audioProbe.streams.push(stream);
    return stream;
  };
});

const audioProbe = () =>
  page.evaluate(() => {
    const probe = window.__audioProbe;
    const tracks = probe.streams.flatMap((s) => s.getTracks());
    return {
      contexts: probe.contexts.length,
      micLive: tracks.filter((t) => t.readyState === 'live').length,
      micTotal: tracks.length,
    };
  });

const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));

const openHome = async () => {
  await page.goto(APP, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.__game?.scene.isActive('Home'), null, {
    timeout: 30000,
  });
};

// ------------------------------------------------------ the parental gate

await openHome();
step('holding the grown-ups button');
await page.evaluate(() => {
  window.__game.scene.getScene('Home').grownUpsButton.emit('pointerdown');
});
// The hold is 900ms of real game time; the gate appears once it completes.
await page.waitForSelector('.gate', { timeout: 10000 });
step('gate appeared, answering the question');

const question = await page.textContent('#gate-q');
const [, a, b] = question.match(/What is (\d+) × (\d+)\?/) ?? [];
if (!a) fail(`could not read the gate question: "${question}"`);
await page.fill('.gate-input', String(Number(a) * Number(b)));
await page.click('.gate-ok');

await page.waitForSelector('.rec-root', { timeout: 10000 });
step('recorder open');

// A wrong answer must not open it. Checked after, so a failure here does not
// block the rest of the run.
// ------------------------------------------------------------- recording

step(`recording ${CLIP.key}`);
await page.evaluate(() => {
  // Select the first clip explicitly rather than relying on default state.
  document.querySelector('.rec-row[data-i="0"]').click();
});
await page.click('.rec-root [data-act="record"]');
await page.waitForTimeout(900);
await page.click('.rec-root [data-act="record"]');

await page.waitForFunction(
  () => document.querySelector('.rec-row[data-i="0"] .rec-badge.device'),
  null,
  { timeout: 15000 }
);
step('clip saved to the device');

const stored = await page.evaluate(
  (key) =>
    new Promise((resolve) => {
      const req = indexedDB.open('urdu-learning-games');
      req.onsuccess = () => {
        const tx = req.result.transaction('clips', 'readonly');
        const get = tx.objectStore('clips').get(key);
        get.onsuccess = () =>
          resolve(
            get.result ? { bytes: get.result.bytes, ext: get.result.ext } : null
          );
        get.onerror = () => resolve(null);
      };
      req.onerror = () => resolve(null);
    }),
  CLIP.key
);
if (!stored) fail('nothing in IndexedDB after recording');
else step(`IndexedDB holds ${stored.bytes} bytes (${stored.ext})`);

const played = await page.evaluate((key) => window.__audio.play(key), CLIP.key);
if (played !== true) fail(`play("${CLIP.key}") returned ${played} after recording`);
else step('plays back from the device');

// --------------------------------------------------- the audio hardware

step('checking the microphone is handed back between takes');
// The release is on a timer, so this waits it out rather than assuming.
await page.waitForTimeout(4000);
const idle = await audioProbe();
if (idle.micLive !== 0) {
  fail(
    `${idle.micLive} microphone track(s) still open while idle — an open mic ` +
      `puts a phone's audio path into voice mode and makes playback stutter`
  );
} else {
  step('microphone released while idle');
}
if (idle.contexts !== 1) {
  fail(
    `${idle.contexts} AudioContexts exist; the app must hold exactly one. ` +
      `A second context is a second claim on the audio device.`
  );
} else {
  step('exactly one AudioContext');
}

const stats = await page.evaluate(() => window.__audio.audioStats());
if (stats.device !== 1) fail(`audioStats().device is ${stats.device}, expected 1`);

// --------------------------------------------------------------- export

step('exporting');
const [download] = await Promise.all([
  page.waitForEvent('download', { timeout: 20000 }),
  page.click('.rec-root [data-act="export"]'),
]);
const zipPath = path.join(ROOT, 'verify-export.tmp.zip');
await download.saveAs(zipPath);
process.on('exit', () => fs.existsSync(zipPath) && fs.unlinkSync(zipPath));

const { readArchive } = await import('../src/lib/clip-archive.js');
const archive = await readArchive(
  new Blob([fs.readFileSync(zipPath)]),
  (slug) => expectedClips().find((c) => c.slug === slug)?.key ?? null
);
if (archive.clips.length !== 1) {
  fail(`export holds ${archive.clips.length} clips, expected 1`);
} else if (archive.clips[0].key !== CLIP.key) {
  fail(`export holds ${archive.clips[0].key}, expected ${CLIP.key}`);
} else if (archive.clips[0].bytes !== stored.bytes) {
  fail(`export clip is ${archive.clips[0].bytes} bytes, stored was ${stored.bytes}`);
} else {
  step(`export contains ${CLIP.slug}.${archive.clips[0].ext}, bytes match`);
}

// ------------------------------------------------- wipe, reload, re-import

step('wiping the device and reloading');
await page.evaluate(
  () => new Promise((r) => {
    const req = indexedDB.deleteDatabase('urdu-learning-games');
    req.onsuccess = req.onerror = req.onblocked = () => r();
  })
);
await openHome();

const afterWipe = await page.evaluate(() => window.__audio.audioStats());
if (afterWipe.device !== 0) fail(`device count is ${afterWipe.device} after wipe`);
const silent = await page.evaluate((key) => window.__audio.play(key), CLIP.key);
if (silent !== false) fail('clip still played after the device was wiped');
else step('device is empty, clip is silent');

step('importing the export back');
await page.evaluate(() => {
  window.__game.scene.getScene('Home').grownUpsButton.emit('pointerdown');
});
await page.waitForSelector('.gate', { timeout: 10000 });
const q2 = await page.textContent('#gate-q');
const [, c, d] = q2.match(/What is (\d+) × (\d+)\?/);
await page.fill('.gate-input', String(Number(c) * Number(d)));
await page.click('.gate-ok');
await page.waitForSelector('.rec-root');

await page.setInputFiles('.rec-root input[type=file]', zipPath);
await page.waitForFunction(
  () => document.querySelector('.rec-row[data-i="0"] .rec-badge.device'),
  null,
  { timeout: 20000 }
);
const replayed = await page.evaluate((key) => window.__audio.play(key), CLIP.key);
if (replayed !== true) fail('imported clip did not play');
else step('imported clip plays');

await page.screenshot({
  path: process.argv[2] || path.join(ROOT, 'recorder-check.png'),
});

// ------------------------------------------------- promote into the repo

step('handing the export to the studio');
const response = await fetch(`http://localhost:${STUDIO_PORT}/api/import`, {
  method: 'POST',
  headers: { 'content-type': 'application/zip' },
  body: fs.readFileSync(zipPath),
});
if (!response.ok) {
  fail(`studio import returned ${response.status}: ${await response.text()}`);
} else {
  const { written, unknown } = await response.json();
  const landed = resolveClip(CLIP.slug);
  if (!landed) fail('studio import wrote nothing that resolves');
  else if (landed.source !== 'recorded') fail(`resolved as ${landed.source}`);
  else step(`studio wrote ${written.join(', ')} (${unknown.length} skipped)`);
}

// ------------------------------------------------------ the gate holds up

step('checking a wrong answer does not open the recorder');
await openHome();
await page.evaluate(() => {
  window.__game.scene.getScene('Home').grownUpsButton.emit('pointerdown');
});
await page.waitForSelector('.gate');
await page.fill('.gate-input', '1');
await page.click('.gate-ok');
await page.waitForTimeout(400);
if (await page.$('.rec-root')) fail('a wrong answer opened the recorder');
else step('wrong answer refused');

step('checking a tap alone does not open the gate');
await page.evaluate(() => {
  const button = window.__game.scene.getScene('Home').grownUpsButton;
  button.emit('pointerdown');
  button.emit('pointerup');
});
await page.waitForTimeout(1400);
if (await page.$('.gate')) fail('a quick tap opened the gate');
else step('quick tap refused');

// After everything — including a second visit to the recorder — the page must
// still hold one context and no open microphone.
const finalProbe = await audioProbe();
if (finalProbe.contexts !== 1) {
  fail(`${finalProbe.contexts} AudioContexts after the whole run; expected 1`);
}
if (finalProbe.micLive !== 0) {
  fail(`${finalProbe.micLive} microphone track(s) still open at the end`);
}
if (finalProbe.contexts === 1 && finalProbe.micLive === 0) {
  step(`ends with 1 AudioContext and no open microphone`);
}

if (errors.length) {
  for (const e of errors) console.error('  console: ' + e);
  fail(`${errors.length} console error(s)`);
}

await browser.close();
clearTimeout(watchdog);
console.log(
  process.exitCode ? 'recording verification FAILED' : 'recording verification passed'
);
process.exit(process.exitCode ?? 0);
