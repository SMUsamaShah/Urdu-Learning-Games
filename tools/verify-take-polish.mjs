/* Checks that tidying a take trims the room without eating the speech. */

import { fail, openApp, step } from './harness.mjs';

const LEAD = 0.8;
const SPEECH = 0.5;
const TAIL = 0.9;

/* The takes to try, as they would come off a real microphone. */
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
    // Not to the target.
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
    // No findable edge.
    trims: false,
  },
];

const { page, finish } = await openApp({ name: 'take polish' });

for (const testCase of CASES) {
  step(`${testCase.name} (room ${testCase.noiseDb} dBFS, voice ${testCase.speech})`);

  const result = await page.evaluate(
    async ([lead, speech, tail, noiseDb, speechPeak]) => {
      const { polishTake } = await import('/src/lib/take-polish.js');
      const ctx = new AudioContext();

      /* Encodes an AudioBuffer the way MediaRecorder would have produced it. */
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

      // The room, everywhere, including under the voice.
      const noise = 10 ** (noiseDb / 20);
      for (let i = 0; i < total; i++) data[i] = (Math.random() * 2 - 1) * noise;

      // Shape the test syllable with soft edges and a few harmonics.
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

      // And the first 30ms.
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
    // The room is far below the voice, so normalisation should be safe.
    if (result.peak < 0.6) {
      fail(`${testCase.name}: peak came out at ${result.peak.toFixed(2)}; too quiet to hear`);
    }
  } else if (result.gain < 1.2) {
    fail(
      `${testCase.name}: left at +${result.gain.toFixed(2)}x — the noise ceiling is so tight ` +
        'that a quiet take gets no help at all'
    );
  }

  // The other half of that trade-off.
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

step('a word recorded in a reverberant room');

const T60 = 0.7;

const room = await page.evaluate(
  async ([lead, speech, tail, t60]) => {
    const { polishTake } = await import('/src/lib/take-polish.js');
    const ctx = new AudioContext();

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
    const dry = ctx.createBuffer(1, total, rate);
    const data = dry.getChannelData(0);
    const noise = 10 ** (-52 / 20);
    for (let i = 0; i < total; i++) data[i] = (Math.random() * 2 - 1) * noise;
    const from = Math.round(lead * rate);
    const to = Math.round((lead + speech) * rate);
    for (let i = from; i < to; i++) {
      const t = (i - from) / (to - from);
      const envelope = Math.sin(Math.PI * t) ** 1.4;
      const phase = (2 * Math.PI * 190 * i) / rate;
      const voice = Math.sin(phase) + 0.4 * Math.sin(phase * 2) + 0.2 * Math.sin(phase * 3);
      data[i] += (voice / 1.6) * 0.45 * envelope;
    }

    // Add a direct signal and a controlled room tail.
    const impulseLength = Math.round(t60 * 1.2 * rate);
    const impulse = ctx.createBuffer(1, impulseLength, rate);
    const tap = impulse.getChannelData(0);
    tap[0] = 1;
    for (let i = Math.round(0.004 * rate); i < impulseLength; i++) {
      tap[i] = (Math.random() * 2 - 1) * 0.5 * 10 ** ((-3 * i) / (t60 * rate));
    }

    const offline = new OfflineAudioContext(1, total, rate);
    const source = offline.createBufferSource();
    source.buffer = dry;
    const convolver = offline.createConvolver();
    // Off, or the node rescales the impulse and the direct sound stops being the direct sound.
    convolver.normalize = false;
    convolver.buffer = impulse;
    source.connect(convolver).connect(offline.destination);
    source.start();
    const rendered = await offline.startRendering();

    // Normalise because convolution can exceed full scale.
    const wet = ctx.createBuffer(1, total, rate);
    const wetData = wet.getChannelData(0);
    const renderedData = rendered.getChannelData(0);
    let peak = 0;
    for (let i = 0; i < total; i++) peak = Math.max(peak, Math.abs(renderedData[i]));
    for (let i = 0; i < total; i++) wetData[i] = (renderedData[i] / peak) * 0.7;

    const polish = async (buffer) => {
      const original = await encode(buffer);
      const polished = await polishTake(ctx, original, original.type);
      if (!polished) return null;
      const out = await ctx.decodeAudioData(await polished.blob.arrayBuffer());
      return { duration: out.duration, roomT60: polished.roomT60 };
    };

    return { wet: await polish(wet), dry: await polish(dry) };
  },
  [LEAD, SPEECH, TAIL, T60]
);

if (!room.wet || !room.dry) {
  fail('the reverberant or the dry take was declined outright');
} else {
  step(
    `  reverberant: ${room.wet.duration.toFixed(2)}s, room ` +
      `${room.wet.roomT60 === null ? 'not found' : `${room.wet.roomT60.toFixed(2)}s`} · ` +
      `dry: ${room.dry.duration.toFixed(2)}s, room ` +
      `${room.dry.roomT60 === null ? 'not found' : `${room.dry.roomT60.toFixed(2)}s`}`
  );

  if (room.wet.roomT60 === null) {
    fail(`a take convolved with a ${T60}s room came back reporting no room at all`);
  } else if (room.wet.roomT60 < T60 * 0.5 || room.wet.roomT60 > T60 * 1.6) {
    fail(
      `a ${T60}s room was measured as ${room.wet.roomT60.toFixed(2)}s — far enough out that ` +
        'the subtraction depth is set from the wrong number'
    );
  }

  // A dry take must be left alone.
  if (room.dry.roomT60 !== null) {
    fail(
      `a dry take was treated as a ${room.dry.roomT60.toFixed(2)}s room — it will come back ` +
        'thinner than it went in for no reason'
    );
  }

  // Check the full trim-and-dereverb result.
  const stretch = room.wet.duration - room.dry.duration;
  if (stretch > 0.35) {
    fail(
      `the reverberant take trimmed to ${room.wet.duration.toFixed(2)}s against the dry ` +
        `take's ${room.dry.duration.toFixed(2)}s — the tail is still holding the gate open`
    );
  }
}

await finish();
