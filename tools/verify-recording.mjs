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
import { fail, homeIsUp, openApp, step } from './harness.mjs';
import { RECORDED_DIR, ROOT, expectedClips, resolveClip } from './audio-keys.mjs';

const APP_PORT = 5199;
const STUDIO_PORT = 5196;
const APP = `http://localhost:${APP_PORT}`;
const CLIP = expectedClips()[0]; // letter/alif/name

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

const { context, page, finish } = await openApp({
  name: 'recording',
  timeoutMs: 180000,
  // Navigated below by openHome(), after the audio probe is installed — an
  // init script only applies to loads that come after it.
  open: false,
  context: { acceptDownloads: true },
  args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'],
});
await context.grantPermissions(['microphone'], { origin: APP });

// Watch what the page does with audio hardware. Two things caused real,
// user-reported stuttering and must not come back:
//
//   1. a second AudioContext — a second claim on the audio device
//   2. the microphone held open while playback is happening, which moves a
//      phone's audio path into its communications profile
//
// What counts is how many are *live*. A context that has been constructed and
// then closed holds nothing — and one gets constructed whether we like it or
// not, because importing Tone.js builds its own before any of our code can
// intervene, which src/lib/tone-setup.js then disposes. Counting constructions
// instead of open devices fails on that, which is a true statement about the
// wrong thing.
await page.addInitScript(() => {
  window.__audioProbe = { contexts: [], streams: [] };
  const Ctor = window.AudioContext;
  window.AudioContext = class extends Ctor {
    constructor(...args) {
      super(...args);
      window.__audioProbe.contexts.push(this);
    }
  };
  // Every buffer the page plays *out loud*, so a check can tell whether saving
  // a take played it back.
  //
  // Where it connects is the whole distinction. The tidy-up plays the take
  // twice without a sound coming out: once into an OfflineAudioContext to trim
  // and level it, and once into a MediaStreamDestination, which is the only way
  // to reach the browser's Opus encoder — see take-polish.js. Counting starts
  // alone counts both, and reports playback on a run where nothing was audible.
  // Only a source routed at a live, real output is a source anybody heard.
  window.__audioProbe.started = 0;
  const connect = AudioBufferSourceNode.prototype.connect;
  AudioBufferSourceNode.prototype.connect = function (dest, ...rest) {
    const offline = dest?.context?.constructor?.name === 'OfflineAudioContext';
    if (!offline && !(dest instanceof MediaStreamAudioDestinationNode)) {
      this.__audible = true;
    }
    return connect.call(this, dest, ...rest);
  };
  const start = AudioBufferSourceNode.prototype.start;
  AudioBufferSourceNode.prototype.start = function (...args) {
    if (this.__audible) window.__audioProbe.started++;
    return start.apply(this, args);
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
      contexts: probe.contexts.filter((c) => c.state !== 'closed').length,
      contextsBuilt: probe.contexts.length,
      micLive: tracks.filter((t) => t.readyState === 'live').length,
      micTotal: tracks.length,
    };
  });

const openHome = async () => {
  await page.goto(APP, { waitUntil: 'domcontentloaded' });
  await homeIsUp(page);
};

/** Settings -> Your recordings. Waits for the page rather than for a timer. */
const openRecordings = async () => {
  await page.click('.set-root [data-page="recordings"]');
  await page.waitForSelector('.rec-root', { timeout: 20000 });
};

// ------------------------------------------------------ the parental gate

await openHome();
step('holding the grown-ups button');
await page.evaluate(() => {
  window.__game.scene.getScene('Home').settingsButton.emit('pointerdown');
});
// The hold is 900ms of real game time; the gate appears once it completes.
await page.waitForSelector('.gate', { timeout: 10000 });

// The gate has to be styled the *first* time it is shown, before the recorder
// has ever been opened. Its rules used to live in the recorder's stylesheet,
// which is loaded by the dynamic import the gate itself decides whether to
// make — so the first prompt was unstyled text in a corner and every one after
// it looked right. Nobody reports a bug that fixes itself after one use, which
// is exactly why it needs a check.
const gateLook = await page.evaluate(() => {
  const backdrop = document.querySelector('.gate-backdrop');
  const dialog = document.querySelector('.gate');
  const box = dialog.getBoundingClientRect();
  return {
    position: getComputedStyle(backdrop).position,
    dialogBg: getComputedStyle(dialog).backgroundColor,
    centreOffsetX: Math.abs(box.left + box.width / 2 - window.innerWidth / 2),
    centreOffsetY: Math.abs(box.top + box.height / 2 - window.innerHeight / 2),
  };
});

if (gateLook.position !== 'fixed') {
  fail(`the gate backdrop is position:${gateLook.position} — its stylesheet did not load`);
} else if (gateLook.dialogBg === 'rgba(0, 0, 0, 0)') {
  fail('the gate dialog has no background — its stylesheet did not load');
} else if (gateLook.centreOffsetX > 40 || gateLook.centreOffsetY > 40) {
  fail(
    `the gate is ${gateLook.centreOffsetX.toFixed(0)},` +
      `${gateLook.centreOffsetY.toFixed(0)}px off centre — it is not laid out as a dialog`
  );
} else {
  step('gate is styled and centred on its first appearance');
}

step('gate appeared, answering the question');

const question = await page.textContent('#gate-q');
const [, a, b] = question.match(/What is (\d+) × (\d+)\?/) ?? [];
if (!a) fail(`could not read the gate question: "${question}"`);
await page.fill('.gate-input', String(Number(a) * Number(b)));
await page.click('.gate-ok');

await page.waitForSelector('.set-root', { timeout: 10000 });
step('settings open');

// The recorder lives behind its own row now rather than being the whole
// screen. Opening it is part of what this checks: a recorder nobody can reach
// is as broken as one that does not record.
await openRecordings();
step('recorder open');

// And a way back out. The recorder was still styled as a full-screen overlay
// when it became a page, so it covered the title bar it now sits under —
// including the only arrow off the page. Nothing threw; the screen was simply
// a dead end until the tab was reloaded.
step('checking the way back out of the recorder');
const backIsReachable = await page.evaluate(() => {
  const back = document.querySelector('.set-back');
  if (!back) return { found: false };
  const box = back.getBoundingClientRect();
  const onTop = document.elementFromPoint(
    box.left + box.width / 2,
    box.top + box.height / 2
  );
  return { found: true, clickable: back.contains(onTop) || onTop === back };
});
if (!backIsReachable.found) fail('no back arrow while the recorder is open');
else if (!backIsReachable.clickable) fail('the recorder is covering the back arrow');
else {
  await page.click('.set-back');
  await page.waitForSelector('[data-page="recordings"]', { timeout: 10000 });
  step('back returns to the settings list');
  await openRecordings();
}

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

// ------------------------------------------ hearing the take back, or not

// The tune uses the same node type, so it would land in the count as well.
await page.evaluate(() => window.__music.setMusicOn(false));

/** Records over the same clip and reports whether anything was played back. */
async function recordAgain() {
  // Saving used to step the selection on to the next clip, so this had to click
  // its way back to the first one and wait for that to stick. The recorder now
  // stays where it is, which is what the waveform editor wants, so a second
  // take simply overwrites the same clip — but assert that rather than assume
  // it, because everything after here expects exactly one clip on the device.
  await page.waitForSelector('.rec-root .rec-row[data-i="0"][aria-selected="true"]', {
    timeout: 15000,
  });
  await page.evaluate(() => {
    window.__audio.stopAll();
    window.__audioProbe.started = 0;
  });
  await page.click('.rec-root [data-act="record"]');
  await page.waitForTimeout(900);
  await page.click('.rec-root [data-act="record"]');
  // Long enough for the tidy-up, the save and any playback that follows.
  await page.waitForTimeout(4000);
  return page.evaluate(() => window.__audioProbe.started);
}

step('a saved take is played back when the box is ticked');
const heard = await recordAgain();
if (heard < 1) fail('the take was saved but never played back');
else step(`  ${heard} clip(s) started`);

step('and is not, when it is unticked');
await page.uncheck('.rec-root [data-act="playback"]');
const quiet = await recordAgain();
if (quiet !== 0) fail(`playback was switched off but ${quiet} clip(s) still started`);
else step('  nothing played');
await page.check('.rec-root [data-act="playback"]');

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
    `${idle.contexts} live AudioContexts (${idle.contextsBuilt} built); the app must ` +
      `hold exactly one. A second open context is a second claim on the audio device.`
  );
} else {
  step(
    `exactly one live AudioContext` +
      (idle.contextsBuilt > 1 ? ` (${idle.contextsBuilt} built, the rest closed)` : '')
  );
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
  window.__game.scene.getScene('Home').settingsButton.emit('pointerdown');
});
await page.waitForSelector('.gate', { timeout: 10000 });
const q2 = await page.textContent('#gate-q');
const [, c, d] = q2.match(/What is (\d+) × (\d+)\?/);
await page.fill('.gate-input', String(Number(c) * Number(d)));
await page.click('.gate-ok');
await page.waitForSelector('.set-root');
await openRecordings();

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
  window.__game.scene.getScene('Home').settingsButton.emit('pointerdown');
});
await page.waitForSelector('.gate');
await page.fill('.gate-input', '1');
await page.click('.gate-ok');
await page.waitForTimeout(400);
if (await page.$('.set-root')) fail('a wrong answer opened settings');
else step('wrong answer refused');

step('checking a tap alone does not open the gate');
await page.evaluate(() => {
  const button = window.__game.scene.getScene('Home').settingsButton;
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

await finish();
