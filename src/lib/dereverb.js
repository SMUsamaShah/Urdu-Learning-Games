/* Takes the room off a recording. */

/* Frame for the decay measurement. */
const DECAY_FRAME_MS = 10;

/* Where the noise floor is read off the frame energies. */
const NOISE_PERCENTILE = 0.15;

/* How far above the noise floor the decay has to still be to be believed. */
const DECAY_ABOVE_NOISE_DB = 8;

/* How far below the loudest moment the measurement starts. */
const OFFSET_BELOW_PEAK_DB = 12;

/* The span of the decay used for the fit, and how few frames make it worthless. */
const FIT_FROM_DB = -5;
const FIT_TO_DB = [-25, -20, -15];
const MIN_FIT_FRAMES = 4;

/* The range of rooms worth acting on. */
const MIN_T60 = 0.3;
const MAX_T60 = 1.6;

/* Analysis window and hop. */
const WINDOW_MS = 32;
const OVERLAP = 4;

/* How far back the tail is predicted from, and how hard it is subtracted. */
const LATE_ONSET_MS = 48;
const OVER_SUBTRACT = 1.6;
const FLOOR = 0.16;

/* How much of the previous frame's gain is kept. */
const GAIN_SMOOTHING = 0.5;

const dB10 = (power) => 10 * Math.log10(Math.max(power, 1e-20));

/* The value at a percentile of a list, which this sorts a copy of. */
function percentile(values, fraction) {
  const sorted = Array.from(values).sort((a, b) => a - b);
  const at = Math.min(sorted.length - 1, Math.max(0, Math.round(fraction * (sorted.length - 1))));
  return sorted[at];
}

/* Energy per frame. */
function energies(samples, frame) {
  const count = Math.max(1, Math.floor(samples.length / frame));
  const out = new Float64Array(count);
  for (let f = 0; f < count; f++) {
    let sum = 0;
    const from = f * frame;
    const to = Math.min(samples.length, from + frame);
    for (let i = from; i < to; i++) sum += samples[i] * samples[i];
    out[f] = sum / Math.max(1, to - from);
  }
  return out;
}

/** The room's reverberation time, in seconds, or null.
 * @param {Float32Array|Float64Array|number[]} samples
 * @param {number} rate
 * @returns {{t60: number, span: number}|null} `span` is how many dB the fit
 */
export function estimateT60(samples, rate) {
  if (!samples?.length || !(rate > 0)) return null;
  const frame = Math.max(1, Math.round((DECAY_FRAME_MS / 1000) * rate));
  const energy = energies(samples, frame);
  if (energy.length < 12) return null;

  const noise = percentile(energy, NOISE_PERCENTILE);

  // Smoothed before anything is read off it.
  const smooth = new Float64Array(energy.length);
  for (let i = 0; i < energy.length; i++) {
    const a = Math.max(0, i - 1);
    const b = Math.min(energy.length - 1, i + 1);
    let sum = 0;
    for (let j = a; j <= b; j++) sum += energy[j];
    smooth[i] = sum / (b - a + 1);
  }

  let peak = 0;
  for (let i = 1; i < smooth.length; i++) if (smooth[i] > smooth[peak]) peak = i;

  // Where the voice has finished and only the room is left.
  const quiet = smooth[peak] * 10 ** (-OFFSET_BELOW_PEAK_DB / 10);
  let offset = -1;
  for (let i = peak + 1; i < smooth.length; i++) {
    if (smooth[i] <= quiet) {
      offset = i;
      break;
    }
  }
  if (offset < 0) return null;

  // And it runs until the room reaches the noise floor.
  const audible = noise * 10 ** (DECAY_ABOVE_NOISE_DB / 10);
  let limit = offset;
  for (let i = offset + 1; i < energy.length; i++) if (smooth[i] > audible) limit = i;
  if (limit - offset < MIN_FIT_FRAMES + 2) return null;

  // Schroeder: the energy still to come, from each point onward.
  const curve = new Float64Array(limit - offset + 1);
  let running = 0;
  for (let i = limit; i >= offset; i--) {
    running += Math.max(energy[i] - noise, 0);
    curve[i - offset] = running;
  }
  const top = curve[0];
  if (!(top > 0)) return null;

  const at = (target) => {
    for (let i = 0; i < curve.length; i++) {
      if (dB10(curve[i] / top) <= target) return i;
    }
    return -1;
  };

  const from = at(FIT_FROM_DB);
  if (from < 0) return null;
  for (const target of FIT_TO_DB) {
    const to = at(target);
    if (to < 0 || to - from < MIN_FIT_FRAMES) continue;
    const perFrame = (target - FIT_FROM_DB) / (to - from);
    if (!(perFrame < 0)) continue;
    const t60 = (-60 / perFrame) * (DECAY_FRAME_MS / 1000);
    if (!(t60 > 0) || !Number.isFinite(t60)) continue;
    return { t60, span: FIT_FROM_DB - target };
  }
  return null;
}

/* In-place iterative radix-2 FFT. */
function fft(re, im, inverse) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      const tr = re[i];
      re[i] = re[j];
      re[j] = tr;
      const ti = im[i];
      im[i] = im[j];
      im[j] = ti;
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const angle = ((inverse ? 2 : -2) * Math.PI) / len;
    const wr = Math.cos(angle);
    const wi = Math.sin(angle);
    const half = len >> 1;
    for (let i = 0; i < n; i += len) {
      let cr = 1;
      let ci = 0;
      for (let k = 0; k < half; k++) {
        const ar = re[i + k];
        const ai = im[i + k];
        const br = re[i + k + half] * cr - im[i + k + half] * ci;
        const bi = re[i + k + half] * ci + im[i + k + half] * cr;
        re[i + k] = ar + br;
        im[i + k] = ai + bi;
        re[i + k + half] = ar - br;
        im[i + k + half] = ai - bi;
        const next = cr * wr - ci * wi;
        ci = cr * wi + ci * wr;
        cr = next;
      }
    }
  }
  if (inverse) {
    for (let i = 0; i < n; i++) {
      re[i] /= n;
      im[i] /= n;
    }
  }
}

const nextPowerOfTwo = (n) => 2 ** Math.ceil(Math.log2(Math.max(2, n)));

/** Suppresses the late reverberation in a recording.
 * @param {Float32Array|Float64Array|number[]} samples
 * @param {number} rate
 * @param {object} [options]
 * @param {number} [options.t60] the room, if it is already known.
 * @returns {{samples: Float32Array, t60: number}|null}
 */
export function dereverb(samples, rate, options = {}) {
  if (!samples?.length || !(rate > 0)) return null;

  const measured = options.t60 ?? estimateT60(samples, rate)?.t60 ?? null;
  if (measured === null) return null;
  // A dry take is not a failure.
  if (measured < MIN_T60 || measured > MAX_T60) return null;

  const size = nextPowerOfTwo(Math.round((WINDOW_MS / 1000) * rate));
  const hop = Math.max(1, Math.floor(size / OVERLAP));
  if (samples.length < size * 2) return null;

  // Hann, applied on the way in and again on the way out.
  const window = new Float64Array(size);
  for (let i = 0; i < size; i++) window[i] = Math.sin((Math.PI * (i + 0.5)) / size);

  const frames = Math.floor((samples.length - size) / hop) + 1;
  const bins = size / 2 + 1;
  const magnitude = new Float64Array(frames * bins);
  const realParts = new Float64Array(frames * bins);
  const imagParts = new Float64Array(frames * bins);

  const re = new Float64Array(size);
  const im = new Float64Array(size);
  for (let f = 0; f < frames; f++) {
    const from = f * hop;
    for (let i = 0; i < size; i++) {
      re[i] = (samples[from + i] ?? 0) * window[i];
      im[i] = 0;
    }
    fft(re, im, false);
    for (let k = 0; k < bins; k++) {
      const index = f * bins + k;
      realParts[index] = re[k];
      imagParts[index] = im[k];
      magnitude[index] = Math.hypot(re[k], im[k]);
    }
  }

  // How much quieter the room is, one delay later.
  const hopSeconds = hop / rate;
  const delay = Math.max(1, Math.round((LATE_ONSET_MS / 1000) / hopSeconds));
  const alpha = (3 * Math.LN10) / measured;
  const decay = Math.exp(-2 * alpha * delay * hopSeconds);

  const out = new Float64Array(samples.length);
  const weight = new Float64Array(samples.length);
  const previousGain = new Float64Array(bins).fill(1);

  for (let f = 0; f < frames; f++) {
    for (let k = 0; k < bins; k++) {
      const index = f * bins + k;
      const power = magnitude[index] * magnitude[index];
      let gain = 1;
      if (f >= delay) {
        const older = magnitude[(f - delay) * bins + k];
        const tail = decay * older * older;
        const cleaned = power - OVER_SUBTRACT * tail;
        gain = Math.sqrt(Math.max(cleaned, FLOOR * FLOOR * power) / Math.max(power, 1e-20));
      }
      // Smoothed across time.
      gain = GAIN_SMOOTHING * previousGain[k] + (1 - GAIN_SMOOTHING) * gain;
      previousGain[k] = gain;
      realParts[index] *= gain;
      imagParts[index] *= gain;
    }

    for (let k = 0; k < bins; k++) {
      re[k] = realParts[f * bins + k];
      im[k] = imagParts[f * bins + k];
    }
    // The half of the spectrum the real FFT did not store, restored by symmetry so the inverse comes back real.
    for (let k = bins; k < size; k++) {
      re[k] = realParts[f * bins + (size - k)];
      im[k] = -imagParts[f * bins + (size - k)];
    }
    fft(re, im, true);

    const from = f * hop;
    for (let i = 0; i < size; i++) {
      if (from + i >= out.length) break;
      out[from + i] += re[i] * window[i];
      weight[from + i] += window[i] * window[i];
    }
  }

  const cleaned = new Float32Array(samples.length);
  for (let i = 0; i < samples.length; i++) {
    // Fill gaps where the windows do not sum to one.
    cleaned[i] = weight[i] > 1e-3 ? out[i] / weight[i] : samples[i];
  }
  return { samples: cleaned, t60: measured };
}
