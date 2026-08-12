/**
 * Checks that tidying a take trims the room without eating the speech.
 *
 * This is the check that matters most about that feature, because its failure
 * modes are both quiet and expensive: a gate set slightly too aggressively
 * shaves the first consonant off every clip, and one set too timidly does
 * nothing at all. Either way nobody notices until a hundred recordings have
 * been made in somebody's own voice.
 *
 * ## Why the takes here have noise in them
 *
 * The first version of this check built a take out of digital silence with a
 * tone in the middle, and passed against a gate that could never fire on a real
 * recording. **A phone in a room produces no silence.** It produces a floor of
 * fridge, street and mic hiss somewhere around -40 dBFS, and a gate measured
 * against the loudest sample rather than against that floor sits underneath it,
 * marks the whole take as speech and trims nothing.
 *
 * So every case below is built with a noise floor, at levels a phone actually
 * produces, and one of them is deliberately too noisy to gate at all — because
 * declining to touch a take it cannot read is the behaviour that keeps somebody
 * from losing a recording.
 *
 * The studio's own verification cannot cover any of this. It drives a synthetic
 * microphone emitting a continuous tone, so there is nothing to trim and the
 * whole path runs and asserts nothing. Here the audio is built by hand and the
 * answer is known in advance.
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

/**
 * The takes to try, as they would come off a real microphone.
 *
 * `noiseDb` is the room, `speech` the peak of the voice over it. The quiet
 * phone case is the one the old gate failed: a modest voice over an ordinary
 * room floor, with no digital silence anywhere in the file.
 */
const CASES = [
  {
    name: 'a clean recording, near-silent room',
    noiseDb: -72,
    speech: 0.32,
    trims: true,
    reachesTarget: true,
  },
  {
    name: 'a phone in an ordinary room',
    noiseDb: -42,
    speech: 0.3,
    trims: true,
    reachesTarget: true,
  },
  {
    name: 'a quiet voice in a noisy room',
    noiseDb: -34,
    speech: 0.18,
    trims: true,
    // Not to the target. The room is close enough behind the voice that
    // reaching it would bring the room up too, and the noise ceiling stops
    // that; the assertion here is that it still gets meaningfully louder.
    reachesTarget: false,
  },
  {
    name: 'a loud voice, close mic',
    noiseDb: -48,
    speech: 0.92,
    trims: true,
    reachesTarget: true,
  },
  {
    name: 'room so loud the voice is barely above it',
    noiseDb: -20,
    speech: 0.14,
    // No findable edge. Keeping the take as recorded is the right answer, and
    // guessing at one is how a gate eats the first syllable.
    trims: false,
  },
];

const browser = await chromium.launch(launchOptions());
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));

await page.goto(APP, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => window.__game?.scene.isActive('Home'), null, {
  timeout: 30000,
});

for (const testCase of CASES) {
  step(`${testCase.name} (room ${testCase.noiseDb} dBFS, voice ${testCase.speech})`);

  const result = await page.evaluate(
    async ([lead, speech, tail, noiseDb, speechPeak]) => {
      const { polishTake } = await import('/src/lib/take-polish.js');
      const ctx = new AudioContext();

      /** Encodes an AudioBuffer the way MediaRecorder would have produced it. */
      const encode = (buffer) =>
        new Promise((resolve) => {
          const destination = ctx.createMediaStreamDestination();
          const recorder = new MediaRecorder(destination.stream);
          const chunks = [];
          recorder.ondataavailable = (e) => e.data.size && chunks.push(e.data);
          recorder.onstop = () =>
            resolve(new Blob(chunks, { type: recorder.mimeType }));
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

      // The room, everywhere, including under the voice. This is the part the
      // old check left out and the whole reason it proved nothing.
      const noise = 10 ** (noiseDb / 20);
      for (let i = 0; i < total; i++) data[i] = (Math.random() * 2 - 1) * noise;

      // A syllable: shaped so it starts and ends softly the way speech does,
      // with a couple of harmonics so it is not a bare sine.
      for (let i = from; i < to; i++) {
        const t = (i - from) / (to - from);
        const envelope = Math.sin(Math.PI * t) ** 1.4;
        const phase = (2 * Math.PI * 190 * i) / rate;
        const voice =
          Math.sin(phase) + 0.4 * Math.sin(phase * 2) + 0.2 * Math.sin(phase * 3);
        data[i] += (voice / 1.6) * speechPeak * envelope;
      }

      const original = await encode(raw);
      const polished = await polishTake(ctx, original, original.type);
      if (!polished) return { polished: false, originalDuration: raw.duration };

      const out = await ctx.decodeAudioData(await polished.blob.arrayBuffer());
      const outData = out.getChannelData(0);
      let peak = 0;
      for (let i = 0; i < outData.length; i++) {
        peak = Math.max(peak, Math.abs(outData[i]));
      }

      // Energy in the middle third, which is where the word has to still be.
      let middle = 0;
      const a = Math.floor(outData.length / 3);
      const b = Math.floor((outData.length * 2) / 3);
      for (let i = a; i < b; i++) middle += outData[i] * outData[i];
      middle = Math.sqrt(middle / Math.max(1, b - a));

      // And the first 30ms, which is where a gate that fired late would have
      // left the tail of the room instead of the start of the word.
      let head = 0;
      const headSamples = Math.min(outData.length, Math.round(0.03 * out.sampleRate));
      for (let i = 0; i < headSamples; i++) head += outData[i] * outData[i];
      head = Math.sqrt(head / Math.max(1, headSamples));

      return {
        polished: true,
        originalDuration: raw.duration,
        duration: out.duration,
        peak,
        middleRms: middle,
        headRms: head,
        removedMs: polished.removedMs,
        gain: polished.gain,
      };
    },
    [LEAD, SPEECH, TAIL, testCase.noiseDb, testCase.speech]
  );

  if (!testCase.trims) {
    if (result.polished) {
      fail(
        `${testCase.name}: trimmed a take it cannot read ` +
          `(${result.originalDuration.toFixed(2)}s -> ${result.duration.toFixed(2)}s) — ` +
          'it should have been kept as recorded'
      );
    } else {
      step('  declined, take kept as recorded');
    }
    continue;
  }

  if (!result.polished) {
    fail(`${testCase.name}: declined a take with obvious room either side of the speech`);
    continue;
  }

  step(
    `  ${result.originalDuration.toFixed(2)}s -> ${result.duration.toFixed(2)}s ` +
      `(removed ${result.removedMs}ms, level +${result.gain.toFixed(2)}x, ` +
      `peak ${result.peak.toFixed(2)})`
  );

  // The speech plus the deliberate padding, and nothing like the original.
  const lower = SPEECH * 0.8;
  const upper = SPEECH + 0.6;
  if (result.duration < lower) {
    fail(
      `${testCase.name}: trimmed to ${result.duration.toFixed(2)}s, shorter than the ` +
        `${SPEECH}s of speech — it is eating the word`
    );
  } else if (result.duration > upper) {
    fail(
      `${testCase.name}: trimmed to only ${result.duration.toFixed(2)}s of ` +
        `${result.originalDuration.toFixed(2)}s; the room is still there`
    );
  }

  // Never into the ceiling, whatever went in.
  if (result.peak > 0.995) {
    fail(`${testCase.name}: peak came out at ${result.peak.toFixed(2)}, which is clipping`);
  }

  if (testCase.reachesTarget) {
    // The room is far enough behind the voice that there is nothing stopping
    // this take being brought up to a normal listening level.
    if (result.peak < 0.6) {
      fail(`${testCase.name}: peak came out at ${result.peak.toFixed(2)}; too quiet to hear`);
    }
  } else if (result.gain < 1.2) {
    fail(
      `${testCase.name}: left at +${result.gain.toFixed(2)}x — the noise ceiling is so tight ` +
        'that a quiet take gets no help at all'
    );
  }

  // The other half of that trade-off, and the one that is easy to lose sight
  // of: the lead-in is padding, so it is pure room, and after the gain it has
  // to still be quiet. A cap that has stopped working shows up here as hiss
  // rather than as anything the level assertions above would catch.
  if (result.headRms > 0.04) {
    fail(
      `${testCase.name}: the room came up to rms ${result.headRms.toFixed(3)} — ` +
        'the clip will hiss'
    );
  }

  // If the word had been shaved off the front, the middle would be silent.
  if (result.middleRms < result.headRms * 1.5) {
    fail(
      `${testCase.name}: the middle of the clip (rms ${result.middleRms.toFixed(3)}) is no ` +
        `louder than its lead-in (rms ${result.headRms.toFixed(3)}) — the word is not where ` +
        'it should be'
    );
  }
}

if (errors.length) {
  for (const e of errors) console.error('  ' + e);
  fail(`${errors.length} page error(s)`);
}

await browser.close();
console.log(
  process.exitCode ? 'take polish verification FAILED' : 'take polish verification passed'
);
process.exit(process.exitCode ?? 0);
