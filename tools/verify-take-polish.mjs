/**
 * Checks that tidying a take trims the silence without eating the speech.
 *
 * This is the check that matters most about that feature, because its failure
 * mode is quiet and expensive: a gate set slightly too aggressively shaves the
 * first consonant off every clip, and nobody notices until a hundred
 * recordings have been made in somebody's own voice. Urdu has plenty of
 * consonants that start softly.
 *
 * The studio's own verification cannot cover it. That drives a synthetic
 * microphone, which emits a continuous tone — there is no silence in it to
 * trim, so the whole path runs and asserts nothing. Here the audio is built by
 * hand with known silence at both ends, so the answer is known in advance.
 *
 * Usage: npm run dev &  then  node tools/verify-take-polish.mjs [baseUrl]
 */

import { chromium } from 'playwright';
import { hasBrowser, launchOptions } from './browser.mjs';

const APP = process.argv[2] || 'http://localhost:5173';

const fail = (msg) => {
  console.error('FAIL: ' + msg);
  process.exitCode = 1;
};
const step = (msg) => process.stderr.write(`· ${msg}\n`);

if (!hasBrowser()) {
  console.log('no Chromium installed, skipping');
  process.exit(0);
}

const LEAD = 0.8;
const SPEECH = 0.5;
const TAIL = 0.9;

const browser = await chromium.launch(launchOptions());
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));

await page.goto(APP, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => window.__game?.scene.isActive('Home'), null, {
  timeout: 30000,
});

step('building a take: silence, a quiet word, silence');
const result = await page.evaluate(
  async ([lead, speech, tail]) => {
    const { polishTake } = await import('/src/lib/take-polish.js');
    const ctx = new AudioContext();

    /** Encodes an AudioBuffer the way MediaRecorder would have produced it. */
    const encode = (buffer) =>
      new Promise((resolve) => {
        const destination = ctx.createMediaStreamDestination();
        const recorder = new MediaRecorder(destination.stream);
        const chunks = [];
        recorder.ondataavailable = (e) => e.data.size && chunks.push(e.data);
        recorder.onstop = () => resolve(new Blob(chunks, { type: recorder.mimeType }));
        const source = ctx.createBufferSource();
        source.buffer = buffer;
        source.connect(destination);
        source.onended = () => recorder.state === 'recording' && recorder.stop();
        recorder.start();
        source.start();
      });

    const rate = ctx.sampleRate;
    const total = Math.round((lead + speech + tail) * rate);
    const raw = ctx.createBuffer(1, total, rate);
    const data = raw.getChannelData(0);
    const from = Math.round(lead * rate);
    const to = Math.round((lead + speech) * rate);
    // Deliberately quiet, so the level correction has something to do, and
    // shaped so it starts and ends softly the way a spoken syllable does.
    for (let i = from; i < to; i++) {
      const t = (i - from) / (to - from);
      const envelope = Math.sin(Math.PI * t);
      data[i] = Math.sin((2 * Math.PI * 220 * i) / rate) * 0.32 * envelope;
    }

    const original = await encode(raw);
    const polished = await polishTake(ctx, original, original.type);
    if (!polished) return { polished: false };

    // Measure what came back out.
    const out = await ctx.decodeAudioData(await polished.blob.arrayBuffer());
    const outData = out.getChannelData(0);
    let peak = 0;
    for (let i = 0; i < outData.length; i++) peak = Math.max(peak, Math.abs(outData[i]));

    // Energy in the middle third, which is where the word has to still be.
    let middle = 0;
    const a = Math.floor(outData.length / 3);
    const b = Math.floor((outData.length * 2) / 3);
    for (let i = a; i < b; i++) middle += outData[i] * outData[i];
    middle = Math.sqrt(middle / Math.max(1, b - a));

    return {
      polished: true,
      originalDuration: raw.duration,
      duration: out.duration,
      peak,
      middleRms: middle,
      removedMs: polished.removedMs,
      gain: polished.gain,
    };
  },
  [LEAD, SPEECH, TAIL]
);

if (!result.polished) {
  fail('polishTake declined to do anything to a take with obvious silence in it');
} else {
  step(
    `${result.originalDuration.toFixed(2)}s -> ${result.duration.toFixed(2)}s ` +
      `(removed ${result.removedMs}ms, level +${result.gain.toFixed(2)}x)`
  );

  // The speech plus the deliberate padding, and nothing like the original.
  const lower = SPEECH * 0.8;
  const upper = SPEECH + 0.5;
  if (result.duration < lower) {
    fail(
      `trimmed to ${result.duration.toFixed(2)}s, shorter than the ${SPEECH}s of ` +
        'speech — it is eating the word'
    );
  } else if (result.duration > upper) {
    fail(`trimmed to only ${result.duration.toFixed(2)}s; the silence is still there`);
  } else {
    step('kept the speech and dropped the silence');
  }

  // The whole complaint that started this: a quiet take should come back up.
  // 0.32 in should reach the 0.89 target comfortably within the gain cap, so
  // this checks the levelling itself rather than the ceiling.
  if (result.peak < 0.82) {
    fail(`peak came out at ${result.peak.toFixed(2)}; the level was not raised`);
  } else if (result.peak > 0.99) {
    fail(`peak came out at ${result.peak.toFixed(2)}, which is clipping`);
  } else {
    step(`levelled to a peak of ${result.peak.toFixed(2)}`);
  }

  // If the word had been shaved off the front, the middle would be silent.
  if (result.middleRms < 0.05) {
    fail(`the middle of the clip is silent (rms ${result.middleRms.toFixed(3)})`);
  } else {
    step(`the word is still in there (rms ${result.middleRms.toFixed(2)})`);
  }
}

if (errors.length) {
  for (const e of errors) console.error('  ' + e);
  fail(`${errors.length} page error(s)`);
}

await browser.close();
console.log(process.exitCode ? 'take polish verification FAILED' : 'take polish verification passed');
process.exit(process.exitCode ?? 0);
