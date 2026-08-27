/* Renders the background tune to a WAV file so a person can listen to it. */

import fs from 'node:fs';
import { chromium } from 'playwright';
import { hasBrowser, launchOptions } from './browser.mjs';

const args = process.argv.slice(2);
/* Pulls `--name value` out of the arguments, leaving the positional ones. */
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

// Positionals are told apart by shape rather than by position.
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
  // Tone.Offline swaps the global context while it runs, so the live tune has to be out of the way.
  stopMusic();
  await new Promise((r) => setTimeout(r, 600));

  const { sampleRate, channels } = flourishes
    ? await window.__flourish.renderFlourishes()
    : await renderMusic(seconds, {
        tune: tune || undefined,
        instrument: instrument || undefined,
      });

  // Mixed to mono and quantised in the page.
  const length = channels[0].length;
  const samples = new Int16Array(length);
  for (let i = 0; i < length; i++) {
    let sum = 0;
    for (const channel of channels) sum += channel[i];
    const v = Math.max(-1, Math.min(1, sum / channels.length));
    samples[i] = Math.round(v * 32767);
  }

  // Base64 in slices: String.fromCharCode.apply on a megabyte-long array blows the argument limit.
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

let rawPeak = 0;
let clipped = 0;
for (let i = 0; i < count; i++) {
  const v = Math.abs(pcm[i]);
  if (v > rawPeak) rawPeak = v;
  if (v >= 32700) clipped++;
}

let worstJump = 0;
for (let i = 1; i < count; i++) {
  const jump = Math.abs(pcm[i] - pcm[i - 1]);
  if (jump > worstJump) worstJump = jump;
}

// Not cheating.
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
