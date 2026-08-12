/**
 * Records the background tune to a WAV file so a person can listen to it.
 *
 * "Does the music sound nice" is not a question any automated check can answer,
 * and it is the only question that matters about a background loop. Nor should
 * answering it require running the app, waiting for the audio context to
 * unlock, and sitting through the fade-in — that friction is why a tune stays
 * bad. This makes it one command and a file.
 *
 * It records the real thing rather than re-rendering it: the same Tone.js
 * instruments, the same reverb, the same transport, in the same browser, tapped
 * at the node everything passes through. What comes out is what a child hears.
 *
 * WAV rather than the browser's own encoder, because the point is a file that
 * opens anywhere without thinking about it.
 *
 * Usage: npm run dev &  then  node tools/preview-music.mjs [seconds] [outfile]
 */

import fs from 'node:fs';
import { chromium } from 'playwright';
import { hasBrowser, launchOptions } from './browser.mjs';

const SECONDS = Number(process.argv[2] || 40);
const OUT = process.argv[3] || 'music-preview.wav';
const APP = process.env.APP_URL || 'http://localhost:5173';

if (!hasBrowser()) {
  console.log('no Chromium installed, skipping');
  process.exit(0);
}

const options = launchOptions();
const browser = await chromium.launch({
  ...options,
  // Otherwise the context never leaves 'suspended' and this records silence.
  args: [...options.args, '--autoplay-policy=no-user-gesture-required'],
});
const page = await browser.newPage();
page.on('pageerror', (e) => console.error('PAGEERROR', String(e)));

await page.goto(APP, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => window.__game?.scene.isActive('Home'), null, {
  timeout: 30000,
});

process.stderr.write(`· recording ${SECONDS}s of the tune\n`);

const recorded = await page.evaluate(async (seconds) => {
  const { startMusic, musicOutput, setMusicOn } = window.__music;
  const ctx = window.__game.sound.context;
  if (ctx.state === 'suspended') await ctx.resume();

  setMusicOn(true);
  startMusic();

  // Building the band loads Tone.js and renders a reverb impulse offline.
  const output = await new Promise((resolve) => {
    const until = performance.now() + 20000;
    const look = () => {
      const node = musicOutput();
      if (node || performance.now() > until) return resolve(node);
      setTimeout(look, 100);
    };
    look();
  });
  if (!output) return { error: 'the tune never built' };

  // Past the fade-in, so the recording starts on the music rather than on a
  // second and a half of it arriving.
  await new Promise((r) => setTimeout(r, 2500));

  // A ScriptProcessor, deprecated and perfect for this: it hands over the
  // samples on the main thread with no worklet module to load, and this is a
  // developer tool that runs for half a minute.
  const capture = ctx.createScriptProcessor(4096, 2, 2);
  const chunks = [];
  let frames = 0;
  const wanted = Math.ceil(seconds * ctx.sampleRate);

  const done = new Promise((resolve) => {
    capture.onaudioprocess = (event) => {
      if (frames >= wanted) return;
      const left = event.inputBuffer.getChannelData(0);
      const right =
        event.inputBuffer.numberOfChannels > 1
          ? event.inputBuffer.getChannelData(1)
          : left;
      // Mixed to mono and quantised here rather than in Node, because moving
      // forty seconds of stereo float across the bridge is thirty megabytes.
      const block = new Int16Array(left.length);
      for (let i = 0; i < left.length; i++) {
        const v = Math.max(-1, Math.min(1, (left[i] + right[i]) / 2));
        block[i] = Math.round(v * 32767);
      }
      chunks.push(block);
      frames += left.length;
      if (frames >= wanted) resolve();
    };
  });

  output.connect(capture);
  // A ScriptProcessor only runs when it is connected to something downstream,
  // even though nothing needs to hear it — so it goes to a silenced gain.
  const sink = ctx.createGain();
  sink.gain.value = 0;
  capture.connect(sink);
  sink.connect(ctx.destination);

  await done;

  output.disconnect(capture);
  capture.disconnect();
  sink.disconnect();

  const total = chunks.reduce((n, c) => n + c.length, 0);
  const samples = new Int16Array(total);
  let at = 0;
  for (const chunk of chunks) {
    samples.set(chunk, at);
    at += chunk.length;
  }

  // Base64 in slices: String.fromCharCode.apply on a megabyte-long array blows
  // the argument limit.
  const bytes = new Uint8Array(samples.buffer);
  let binary = '';
  for (let i = 0; i < bytes.length; i += 8192) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + 8192));
  }

  return { sampleRate: ctx.sampleRate, base64: btoa(binary) };
}, SECONDS);

await browser.close();

if (recorded.error) {
  console.error('FAIL: ' + recorded.error);
  process.exit(1);
}

const pcm = Buffer.from(recorded.base64, 'base64');

// Normalised, and that is not cheating. In the app the tune sits at about -19
// dB so it stays under the voice and the sound effects, which makes a raw
// capture of it too quiet to judge on laptop speakers — and what is being
// judged here is the music, not the mix level. The number printed at the end
// is the level it actually plays at.
let rawPeak = 0;
for (let i = 0; i < pcm.length; i += 2) {
  rawPeak = Math.max(rawPeak, Math.abs(pcm.readInt16LE(i)));
}
const boost = rawPeak > 0 ? Math.min(24, 30000 / rawPeak) : 1;
for (let i = 0; i < pcm.length; i += 2) {
  pcm.writeInt16LE(Math.round(pcm.readInt16LE(i) * boost), i);
}

const header = Buffer.alloc(44);
header.write('RIFF', 0);
header.writeUInt32LE(36 + pcm.length, 4);
header.write('WAVE', 8);
header.write('fmt ', 12);
header.writeUInt32LE(16, 16); // PCM chunk size
header.writeUInt16LE(1, 20); // PCM
header.writeUInt16LE(1, 22); // mono
header.writeUInt32LE(recorded.sampleRate, 24);
header.writeUInt32LE(recorded.sampleRate * 2, 28); // byte rate
header.writeUInt16LE(2, 32); // block align
header.writeUInt16LE(16, 34); // bits per sample
header.write('data', 36);
header.writeUInt32LE(pcm.length, 40);

fs.writeFileSync(OUT, Buffer.concat([header, pcm]));

const seconds = pcm.length / 2 / recorded.sampleRate;
const inApp = rawPeak / 32768;
console.log(
  `wrote ${OUT} — ${seconds.toFixed(1)}s, ${(pcm.length / 1024).toFixed(0)} KB, ` +
    `turned up ${boost.toFixed(1)}x for listening (it plays at peak ${inApp.toFixed(3)})`
);
if (inApp < 0.005) {
  console.error('WARNING: that is very quiet. Did the tune actually start?');
  process.exit(1);
}
