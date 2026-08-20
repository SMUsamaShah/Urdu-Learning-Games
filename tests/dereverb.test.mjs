/**
 * Does taking the room off actually take the room off.
 *
 * This is the check the audio pipeline did not have. `verify:polish` builds its
 * test signal out of white noise plus a syllable — a signal with no reverb
 * anywhere in it — so however wrong the code was, that check could not fail on
 * reverb, and for a while the app was described as reducing the room when what
 * it reduced was the noise floor.
 *
 * So the signal here is built the other way round: a dry syllable convolved
 * with a room whose reverberation time this file *chose*. That makes both
 * questions answerable. Is the measured T60 the one that went in, and is the
 * measured T60 of what comes out lower than what went in.
 *
 * Run: npm test
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { dereverb, estimateT60 } from '../src/lib/dereverb.js';

/**
 * Deliberately low.
 *
 * Everything in dereverb.js is specified in milliseconds, so the sample rate is
 * not a variable it can be wrong about — and convolving a room onto a signal
 * costs one multiply per sample per tap, which at a phone's 48 kHz is a
 * billion of them per test. The real rate is covered where it belongs, through
 * the browser, in tools/verify-take-polish.mjs.
 */
const RATE = 12000;

/** A deterministic noise source, so a run that fails fails again. */
function noise(seed = 1) {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return (state / 0x100000000) * 2 - 1;
  };
}

/**
 * A word: a couple of harmonics under an envelope that starts and stops softly,
 * with a little air either side. Not speech, but it has speech's shape — a
 * bare sine would decay into the room far more cleanly than a voice does.
 */
function syllable({ lead = 0.15, length = 0.35, tail = 0.9, floor = 0.0004 } = {}) {
  const random = noise(7);
  const total = Math.round((lead + length + tail) * RATE);
  const out = new Float32Array(total);
  for (let i = 0; i < total; i++) out[i] = random() * floor;

  const from = Math.round(lead * RATE);
  const to = Math.round((lead + length) * RATE);
  for (let i = from; i < to; i++) {
    const t = (i - from) / (to - from);
    const shape = Math.sin(Math.PI * t) ** 1.4;
    const phase = (2 * Math.PI * 190 * i) / RATE;
    const voice = Math.sin(phase) + 0.4 * Math.sin(phase * 2) + 0.2 * Math.sin(phase * 3);
    out[i] += (voice / 1.6) * 0.5 * shape;
  }
  return out;
}

/**
 * A room, as an exponentially decaying burst of noise.
 *
 * That is what a real impulse response looks like after the first few
 * milliseconds, and its decay rate is exactly the T60 asked for — which is what
 * makes the estimate checkable rather than merely plausible.
 */
function room(t60, { direct = 1, wet = 0.5 } = {}) {
  const random = noise(23);
  const length = Math.round(t60 * 1.2 * RATE);
  const impulse = new Float32Array(length);
  impulse[0] = direct;
  const start = Math.round(0.004 * RATE);
  for (let i = start; i < length; i++) {
    impulse[i] = random() * wet * 10 ** ((-3 * i) / (t60 * RATE));
  }
  return impulse;
}

/**
 * Each room built once: they are the expensive part of this file.
 *
 * Normalised, because a convolution sums thousands of random taps and can come
 * out well past full scale, which no recording ever does — a microphone that
 * went past 1 clipped instead.
 */
const rooms = new Map();
const reverberant = (t60) => {
  if (!rooms.has(t60)) {
    const wet = convolve(syllable(), room(t60));
    let peak = 0;
    for (const sample of wet) peak = Math.max(peak, Math.abs(sample));
    for (let i = 0; i < wet.length; i++) wet[i] = (wet[i] / peak) * 0.7;
    rooms.set(t60, wet);
  }
  return rooms.get(t60);
};

function convolve(signal, impulse) {
  const out = new Float32Array(signal.length);
  for (let i = 0; i < impulse.length; i++) {
    const tap = impulse[i];
    if (Math.abs(tap) < 1e-6) continue;
    for (let j = 0; j + i < out.length; j++) out[j + i] += signal[j] * tap;
  }
  return out;
}

/** RMS over a window, in dB. */
function rmsDb(samples, from, to) {
  let sum = 0;
  const a = Math.max(0, Math.round(from));
  const b = Math.min(samples.length, Math.round(to));
  for (let i = a; i < b; i++) sum += samples[i] * samples[i];
  return 10 * Math.log10(Math.max(sum / Math.max(1, b - a), 1e-20));
}

describe('measuring the room', () => {
  test('reads back the reverberation time it was given', () => {
    // The estimate is a straight-line fit to a decay, extrapolated to 60 dB, so
    // it is never exact. Within a third is plenty: everything downstream uses
    // it to set a subtraction depth, not to describe a concert hall.
    for (const t60 of [0.4, 0.7, 1.0]) {
      const wet = reverberant(t60);
      const measured = estimateT60(wet, RATE);
      assert.ok(measured, `no decay found in a room of ${t60}s`);
      // It reads about 13% low across the range, consistently. That is the
      // safe direction — the number sets how hard the tail is subtracted, so
      // reading low under-subtracts — and it is why this band is not tighter.
      const ratio = measured.t60 / t60;
      assert.ok(
        ratio > 0.66 && ratio < 1.5,
        `a ${t60}s room measured as ${measured.t60.toFixed(2)}s`
      );
    }
  });

  test('a dry take has no room to find, or a very short one', () => {
    // Not "returns null": a real recording always has *some* decay, if only the
    // microphone's. What matters is that it comes out short enough that
    // dereverb() declines, which is the next test.
    const measured = estimateT60(syllable(), RATE);
    if (measured) {
      // A dry syllable measures about 0.24s — its own release, read as a room.
      // MIN_T60 sits at 0.3 for exactly this reason.
      assert.ok(measured.t60 < 0.3, `a dry take measured as a ${measured.t60.toFixed(2)}s room`);
    }
  });
});

describe('taking it off', () => {
  test('the direct sound gains on the room', () => {
    // Direct-to-reverberant ratio: the word against what the room is still
    // doing after it. This, not the decay slope, is the thing to measure.
    //
    // Spectral subtraction with a floor cannot make a tail decay *faster* —
    // where it is working fully it scales the tail down by a fixed amount, so
    // the line on a decay curve moves down without changing its angle, and the
    // measured T60 barely shifts. What changes, and what a listener hears, is
    // how far below the voice the room now sits.
    const wet = reverberant(0.8);
    const result = dereverb(wet, RATE);
    assert.ok(result, 'declined a take with an obvious room on it');

    const word = [(0.15 + 0.06) * RATE, (0.15 + 0.3) * RATE];
    const tail = [(0.15 + 0.35 + 0.25) * RATE, (0.15 + 0.35 + 0.55) * RATE];
    const before = rmsDb(wet, ...word) - rmsDb(wet, ...tail);
    const after = rmsDb(result.samples, ...word) - rmsDb(result.samples, ...tail);
    assert.ok(
      after > before + 6,
      `the voice only gained ${(after - before).toFixed(1)} dB on the room`
    );
  });

  test('the tail is quieter where the word is not', () => {
    // The measurement above is a slope. This is the thing a person hears: how
    // loud the room still is a third of a second after the word stopped.
    const wet = reverberant(0.8);
    const result = dereverb(wet, RATE);
    assert.ok(result);

    const tailFrom = (0.15 + 0.35 + 0.25) * RATE;
    const tailTo = (0.15 + 0.35 + 0.55) * RATE;
    const beforeDb = rmsDb(wet, tailFrom, tailTo);
    const afterDb = rmsDb(result.samples, tailFrom, tailTo);
    assert.ok(
      afterDb < beforeDb - 5,
      `the tail only came down ${(beforeDb - afterDb).toFixed(1)} dB`
    );
  });

  test('the word itself survives', () => {
    // The failure mode that matters. A subtraction aggressive enough to kill
    // the tail can hollow out the voice with it, and a clip of a parent saying
    // ب through a duvet is worse than one with a room on it.
    const wet = reverberant(0.8);
    const result = dereverb(wet, RATE);
    assert.ok(result);

    const from = (0.15 + 0.06) * RATE;
    const to = (0.15 + 0.3) * RATE;
    const beforeDb = rmsDb(wet, from, to);
    const afterDb = rmsDb(result.samples, from, to);
    assert.ok(
      afterDb > beforeDb - 4,
      `the word lost ${(beforeDb - afterDb).toFixed(1)} dB — that is the voice, not the room`
    );
  });

  test('a dry take is left alone', () => {
    // Declining is the whole safety property: there is no room to remove, so
    // anything this did to the signal would be damage.
    assert.equal(dereverb(syllable(), RATE), null);
  });

  test('nothing to work with is declined rather than guessed at', () => {
    assert.equal(dereverb(new Float32Array(0), RATE), null);
    assert.equal(dereverb(new Float32Array(64), RATE), null);
    assert.equal(estimateT60(new Float32Array(8), RATE), null);
    // A room far longer than any a parent records a word in. Acting on a number
    // that wrong is worse than acting on none — see MAX_T60.
    assert.equal(dereverb(reverberant(0.8), RATE, { t60: 4 }), null);
  });

  test('what comes back is the same length, and no louder', () => {
    // Subtraction only ever removes, so anything louder than it went in means
    // the overlap-add is not reconstructing — and the level stage downstream
    // would then be levelling a reconstruction error.
    const wet = reverberant(0.8);
    const result = dereverb(wet, RATE);
    assert.equal(result.samples.length, wet.length);
    const peak = (data) => {
      let most = 0;
      for (const sample of data) most = Math.max(most, Math.abs(sample));
      return most;
    };
    const out = peak(result.samples);
    assert.ok(out <= peak(wet) * 1.02, `peak went from ${peak(wet).toFixed(3)} to ${out.toFixed(3)}`);
    assert.ok(Number.isFinite(out) && out > 0.01, 'the take came back empty');
  });
});
