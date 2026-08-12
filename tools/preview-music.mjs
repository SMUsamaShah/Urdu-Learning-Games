/**
 * Renders the background tune to a WAV file so a person can listen to it.
 *
 * "Does the music sound nice" is not a question any automated check can answer,
 * and it is the only question that matters about a background loop. Nor should
 * answering it require running the app, waiting for the audio context to
 * unlock, and sitting through the fade-in — that friction is why a tune stays
 * bad. This makes it one command and a file.
 *
 * ## It renders rather than records, and that distinction cost a round trip
 *
 * The first version tapped the live output through a ScriptProcessorNode. That
 * node runs its callback on the main thread, and the main thread is also
 * running a WebGL game — under software rendering, at single-figure frame
 * rates. The callback was starved, the capture came back full of
 * discontinuities, and the file sounded like a speaker tearing. The music was
 * fine; the recording of it was not, which is an expensive thing to be
 * confused about, because it sends you rewriting a tune that was never the
 * problem.
 *
 * So this asks music.js to render itself through an OfflineAudioContext, which
 * has no main thread to be starved by and runs faster than real time. Same
 * instruments, same reverb, same transport, same everything — it is the module
 * doing the rendering, not a copy of it here.
 *
 * The output is then checked for clicks and clipping before it is written, so
 * that class of problem announces itself instead of being mistaken for
 * songwriting.
 *
 * Usage: npm run dev &  then  node tools/preview-music.mjs [seconds] [outfile]
 */

import fs from 'node:fs';
import { chromium } from 'playwright';
import { hasBrowser, launchOptions } from './browser.mjs';

const args = process.argv.slice(2);
const at = args.indexOf('--instrument');
const INSTRUMENT = at >= 0 ? args[at + 1] : undefined;
const rest = at >= 0 ? args.filter((_, i) => i !== at && i !== at + 1) : args;
const SECONDS = Number(rest[0] || 40);
const OUT = rest[1] || 'music-preview.wav';
const APP = process.env.APP_URL || 'http://localhost:5173';

if (!hasBrowser()) {
  console.log('no Chromium installed, skipping');
  process.exit(0);
}

const options = launchOptions();
const browser = await chromium.launch({
  ...options,
  args: [...options.args, '--autoplay-policy=no-user-gesture-required'],
});
const page = await browser.newPage();
page.on('pageerror', (e) => console.error('PAGEERROR', String(e)));

await page.goto(APP, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => window.__game?.scene.isActive('Home'), null, {
  timeout: 30000,
});

process.stderr.write(`· rendering ${SECONDS}s of the tune${INSTRUMENT ? ` on ${INSTRUMENT}` : ''}\n`);

const rendered = await page.evaluate(async ([seconds, instrument]) => {
  const { renderMusic, stopMusic } = window.__music;
  // Tone.Offline swaps the global context while it runs, so the live tune has
  // to be out of the way.
  stopMusic();
  await new Promise((r) => setTimeout(r, 600));

  const { sampleRate, channels } = await renderMusic(seconds, instrument || undefined);

  // Mixed to mono and quantised in the page, because moving forty seconds of
  // stereo float across the bridge is thirty megabytes.
  const length = channels[0].length;
  const samples = new Int16Array(length);
  for (let i = 0; i < length; i++) {
    let sum = 0;
    for (const channel of channels) sum += channel[i];
    const v = Math.max(-1, Math.min(1, sum / channels.length));
    samples[i] = Math.round(v * 32767);
  }

  // Base64 in slices: String.fromCharCode.apply on a megabyte-long array blows
  // the argument limit.
  const bytes = new Uint8Array(samples.buffer);
  let binary = '';
  for (let i = 0; i < bytes.length; i += 8192) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + 8192));
  }
  return { sampleRate, base64: btoa(binary) };
}, [SECONDS, INSTRUMENT]);

await browser.close();

const raw = Buffer.from(rendered.base64, 'base64');
const count = raw.length / 2;
const pcm = new Int16Array(count);
for (let i = 0; i < count; i++) pcm[i] = raw.readInt16LE(i * 2);

// --- Is it clean? -----------------------------------------------------------

let rawPeak = 0;
let clipped = 0;
for (let i = 0; i < count; i++) {
  const v = Math.abs(pcm[i]);
  if (v > rawPeak) rawPeak = v;
  if (v >= 32700) clipped++;
}

/**
 * Clicks, found as jumps between neighbouring samples.
 *
 * Audio is continuous; a jump of a large fraction of full scale in one sample
 * period is not something an instrument does, it is a seam. Measured against
 * the signal's own peak so it means the same thing however loud the render is.
 */
let clicks = 0;
let worstJump = 0;
const jumpLimit = Math.max(600, rawPeak * 0.45);
for (let i = 1; i < count; i++) {
  const jump = Math.abs(pcm[i] - pcm[i - 1]);
  if (jump > worstJump) worstJump = jump;
  if (jump > jumpLimit) clicks++;
}

// --- Normalise for listening ------------------------------------------------

// Not cheating. In the app the tune sits at about -19 dB so it stays under the
// voice and the sound effects, which makes an honest render too quiet to judge
// on laptop speakers — and what is being judged here is the music, not the mix
// level. The level it actually plays at is printed below.
const boost = rawPeak > 0 ? Math.min(24, 30000 / rawPeak) : 1;
const out = Buffer.alloc(count * 2);
for (let i = 0; i < count; i++) {
  out.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(pcm[i] * boost))), i * 2);
}

const header = Buffer.alloc(44);
header.write('RIFF', 0);
header.writeUInt32LE(36 + out.length, 4);
header.write('WAVE', 8);
header.write('fmt ', 12);
header.writeUInt32LE(16, 16);
header.writeUInt16LE(1, 20); // PCM
header.writeUInt16LE(1, 22); // mono
header.writeUInt32LE(rendered.sampleRate, 24);
header.writeUInt32LE(rendered.sampleRate * 2, 28);
header.writeUInt16LE(2, 32);
header.writeUInt16LE(16, 34);
header.write('data', 36);
header.writeUInt32LE(out.length, 40);

fs.writeFileSync(OUT, Buffer.concat([header, out]));

const seconds = count / rendered.sampleRate;
console.log(
  `wrote ${OUT} — ${seconds.toFixed(1)}s, ${(out.length / 1024).toFixed(0)} KB, ` +
    `turned up ${boost.toFixed(1)}x for listening (it plays at peak ${(rawPeak / 32768).toFixed(3)})`
);

let bad = false;
if (rawPeak / 32768 < 0.005) {
  console.error('WARNING: that is very quiet. Did the tune actually render?');
  bad = true;
}
if (clipped > count / 5000) {
  console.error(`WARNING: ${clipped} samples at full scale — the mix is clipping.`);
  bad = true;
}
if (clicks > 0) {
  console.error(
    `WARNING: ${clicks} discontinuit${clicks === 1 ? 'y' : 'ies'} ` +
      `(worst jump ${(worstJump / 32768).toFixed(2)} of full scale). ` +
      'Those are clicks, and they are a rendering fault rather than a musical one.'
  );
  bad = true;
} else {
  console.log(`clean: no discontinuities, worst step ${(worstJump / 32768).toFixed(3)}`);
}
process.exit(bad ? 1 : 0);
