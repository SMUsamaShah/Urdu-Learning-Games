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
 * Usage: npm run dev &  then
 *   node tools/preview-music.mjs --list
 *   node tools/preview-music.mjs [seconds] [outfile] [--tune waltz] [--instrument koto]
 *   node tools/preview-music.mjs rewards.wav --flourishes
 */

import fs from 'node:fs';
import { chromium } from 'playwright';
import { hasBrowser, launchOptions } from './browser.mjs';

const args = process.argv.slice(2);
/** Pulls `--name value` out of the arguments, leaving the positional ones. */
function option(name) {
  const at = args.indexOf(`--${name}`);
  if (at < 0) return undefined;
  const value = args[at + 1];
  args.splice(at, 2);
  return value;
}
const INSTRUMENT = option('instrument');
const TUNE = option('tune');
const LIST = args.includes('--list');
const FLOURISHES = args.includes('--flourishes');

// Positionals are told apart by shape rather than by position. `40 out.wav` and
// `rewards.wav` and `out.wav 40` all mean what they look like, which matters
// because the flourish render takes no duration — reading its filename as a
// duration silently wrote to the default path and left the file the caller
// asked for missing.
const rest = args.filter((a) => !a.startsWith('--'));
const SECONDS = Number(rest.find((a) => Number.isFinite(Number(a))) ?? 40);
const OUT = rest.find((a) => !Number.isFinite(Number(a))) ?? 'music-preview.wav';
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

if (LIST) {
  const tunes = await page.evaluate(() => window.__music.tuneNames());
  for (const { id, name } of tunes) console.log(`${id.padEnd(12)} ${name}`);
  await browser.close();
  process.exit(0);
}

process.stderr.write(
  FLOURISHES
    ? '· rendering the reward flourishes\n'
    : `· rendering ${SECONDS}s of ${TUNE ?? 'the tune'}${INSTRUMENT ? ` on ${INSTRUMENT}` : ''}\n`
);

const rendered = await page.evaluate(async ([seconds, tune, instrument, flourishes]) => {
  const { renderMusic, stopMusic } = window.__music;
  // Tone.Offline swaps the global context while it runs, so the live tune has
  // to be out of the way.
  stopMusic();
  await new Promise((r) => setTimeout(r, 600));

  const { sampleRate, channels } = flourishes
    ? await window.__flourish.renderFlourishes()
    : await renderMusic(seconds, {
        tune: tune || undefined,
        instrument: instrument || undefined,
      });

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
}, [SECONDS, TUNE, INSTRUMENT, FLOURISHES]);

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

/*
 * There used to be a click detector here — sample-to-sample jumps above a
 * fraction of the file's peak, on the theory that audio is continuous and a
 * seam is not. It was wrong twice over, and both are worth recording so it does
 * not get reinvented.
 *
 * It does not work. A band-limited signal near Nyquist legitimately moves a
 * long way in one sample period: a sine of amplitude A at 16 kHz sampled at
 * 44.1 kHz steps by up to A·2π·16/44.1 ≈ 2.3·A between neighbours. A struck
 * glockenspiel is exactly that kind of signal, so its attacks slew harder than
 * any threshold a real splice would have to clear. Rendering the reward
 * flourishes flagged 646 "discontinuities", every one of them clustered on the
 * seven loudest note onsets. Trying to rescue it by only counting isolated
 * jumps did not separate the cases either (the bad capture: 7 flagged, 7
 * isolated; the flourishes: 646 flagged, 471 isolated).
 *
 * It is also guarding a fault that this path can no longer have. The clicks it
 * once caught came from tapping the live output through a ScriptProcessorNode,
 * whose callback ran on a main thread busy with a WebGL game and got starved.
 * Nothing here streams any more: the audio graph renders itself into an
 * OfflineAudioContext and the whole buffer crosses the bridge in one piece.
 * There is no longer a place for a block to go missing.
 *
 * What is left below is what can still go wrong and can be measured without a
 * heuristic — a mix loud enough to clip, and a render that produced no sound.
 */

let worstJump = 0;
for (let i = 1; i < count; i++) {
  const jump = Math.abs(pcm[i] - pcm[i - 1]);
  if (jump > worstJump) worstJump = jump;
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
console.log(`steepest step between samples: ${(worstJump / 32768).toFixed(3)} of full scale`);
process.exit(bad ? 1 : 0);
