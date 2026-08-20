/**
 * Takes the room off a recording.
 *
 * ## What was here before, and why it did not do this
 *
 * `take-polish.js` says it "reduces the room", and for a long time that
 * sentence was read as meaning reverberation. It does not. What it reduces is
 * the **noise floor** — hiss, a fridge, the street — with a downward expander
 * whose thresholds are set relative to that floor. On a typical phone take the
 * floor sits around −40 dBFS, so the expander is fully open by about −26 dBFS,
 * while the reverberant tail of a voice peaking at −2 dBFS lives between −12
 * and −27. The expander never reaches it. Neither does the 75 Hz high-pass,
 * because a small room is audible from roughly 200 Hz to 2 kHz. And because
 * every clip in this app is a single word, there are no gaps between words for
 * a gate to clean up either.
 *
 * So reverb was untouched, and the check that was supposed to cover it
 * synthesised white noise plus a syllable — a signal with no reverb in it at
 * all, which cannot fail on reverb however wrong the code is.
 *
 * ## What this does instead
 *
 * Late-reverberation suppression in the short-time spectral domain, which is
 * the one approach that works without a measured impulse response of the room:
 *
 *   1. **Measure the room from the recording.** After the word stops, what is
 *      left is the room emptying out. Backward-integrating that decay
 *      (Schroeder) gives a straight line in dB whose slope is the reverberation
 *      time.
 *   2. **Predict the tail.** Late reverberation at any moment is the sound from
 *      a moment ago, quieter by however much the room has decayed since. So the
 *      late-reverb energy in each frequency bin is estimated as the same bin
 *      one delay ago, scaled by the room's own decay over that delay.
 *   3. **Subtract it**, per bin, with a floor under how far any bin may be
 *      pulled down. The floor is what stops this turning into "musical noise" —
 *      isolated bins flickering in and out, which sounds far worse than the
 *      reverb did.
 *
 * ## Why it is a plain function over samples
 *
 * No AudioBuffer, no AudioContext, nothing from the browser. The whole point is
 * that a one-word clip is short enough to hold in memory, so this can be
 * unit-tested in Node against a signal with a *known* reverberation time —
 * `tests/dereverb.test.mjs` builds a dry syllable, convolves it with a room of
 * a stated T60, and measures what comes back. That is a check that can actually
 * fail, which is the thing the old one was missing.
 *
 * ## It declines
 *
 * A recording with no measurable decay, or a dry one, comes back untouched. The
 * same rule the rest of this app follows: doing nothing is always allowed, and
 * a take damaged by a guess is the parent's voice gone.
 */

/** Frame for the decay measurement. Long enough to smooth a glottal pulse. */
const DECAY_FRAME_MS = 10;

/** Where the noise floor is read off the frame energies. Matches take-polish. */
const NOISE_PERCENTILE = 0.15;

/**
 * How far above the noise floor the decay has to still be to be believed.
 *
 * Below this the curve has stopped being the room emptying and started being
 * the microphone, and a fit that includes it reports a far longer T60 than the
 * room has. This is the cheap form of the standard truncation.
 */
const DECAY_ABOVE_NOISE_DB = 8;

/**
 * How far below the loudest moment the measurement starts.
 *
 * This is the correction that made the estimate mean anything. Integrating from
 * the peak measures the *word's own release* — a syllable fading out over a
 * quarter of a second reads as a quarter-second room whether it was recorded in
 * a hall or a wardrobe, and it scales with how long the word was, so a dry take
 * of a long word came back looking more reverberant than a short word recorded
 * in a real room.
 *
 * A reverberation time is by definition the decay *after the source stops*, so
 * the fit starts below the word rather than at it. On a dry take there is
 * nothing under there but the microphone, the curve runs out of range, and no
 * room is reported — which is the correct answer and the one that keeps
 * dereverb() off it.
 *
 * Twelve is a measured compromise, not a round number. Lower leaves more decay
 * to fit and reads mid-sized rooms more accurately; higher is safer against
 * mistaking a long word's release for a room. At 12 dB, dry takes of words from
 * a quarter of a second to seven tenths report either nothing at all or a room
 * of 0.12s — far under MIN_T60 either way — while rooms of 0.4s and 0.7s come
 * back at 0.39 and 0.60.
 */
const OFFSET_BELOW_PEAK_DB = 12;

/**
 * The span of the decay used for the fit, and how few frames make it worthless.
 *
 * Measured from −5 dB below the start of the fit rather than from it directly,
 * so the knee where the word hands over to the room is not part of the line.
 * The deepest reachable of these is used and extrapolated to a full 60 dB.
 */
const FIT_FROM_DB = -5;
const FIT_TO_DB = [-25, -20, -15];
const MIN_FIT_FRAMES = 4;

/**
 * The range of rooms worth acting on.
 *
 * Under 0.3s there is nothing a listener would call reverb and the risk of
 * damaging the voice is all there is — a dry take of a single word measures
 * around 0.24s from the release of the word itself, so this sits above that
 * with room to spare rather than a hundredth of a second clear of it. Over 1.6s the estimate is almost
 * certainly the noise floor rather than a room a parent recorded a word in, and
 * acting on a wrong number is worse than acting on none.
 */
const MIN_T60 = 0.3;
const MAX_T60 = 1.6;

/** Analysis window and hop. 32ms is long enough to resolve the room. */
const WINDOW_MS = 32;
const OVERLAP = 4;

/**
 * How far back the tail is predicted from, and how hard it is subtracted.
 *
 * `LATE_ONSET_MS` is where early reflections stop and late reverberation
 * begins. Early reflections are part of how a voice sounds in a place and
 * removing them makes a recording sound like it was made in a duvet, so the
 * prediction starts after them.
 *
 * `OVER_SUBTRACT` above 1 because the estimate is a statistical one and
 * subtracting exactly it leaves audible tail; `FLOOR` is the least any bin may
 * be reduced to, which is what keeps the result sounding like a room that got
 * smaller rather than like a broken codec.
 */
const LATE_ONSET_MS = 48;
const OVER_SUBTRACT = 1.6;
const FLOOR = 0.16;

/** How much of the previous frame's gain is kept. Smooths bin flicker. */
const GAIN_SMOOTHING = 0.5;

const dB10 = (power) => 10 * Math.log10(Math.max(power, 1e-20));

/** The value at a percentile of a list, which this sorts a copy of. */
function percentile(values, fraction) {
  const sorted = Array.from(values).sort((a, b) => a - b);
  const at = Math.min(sorted.length - 1, Math.max(0, Math.round(fraction * (sorted.length - 1))));
  return sorted[at];
}

/** Energy per frame. */
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

/**
 * The room's reverberation time, in seconds, or null.
 *
 * @param {Float32Array|Float64Array|number[]} samples
 * @param {number} rate
 * @returns {{t60: number, span: number}|null} `span` is how many dB the fit
 *   actually covered, which is how much to trust it.
 */
export function estimateT60(samples, rate) {
  if (!samples?.length || !(rate > 0)) return null;
  const frame = Math.max(1, Math.round((DECAY_FRAME_MS / 1000) * rate));
  const energy = energies(samples, frame);
  if (energy.length < 12) return null;

  const noise = percentile(energy, NOISE_PERCENTILE);

  // Smoothed before anything is read off it. A single frame landing in the gap
  // between two glottal pulses is 10 dB down on its neighbours, and the offset
  // below is a threshold crossing — one such frame would put it in the middle
  // of the word.
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

  // Where the voice has finished and only the room is left. See
  // OFFSET_BELOW_PEAK_DB: everything above this point is the word.
  const quiet = smooth[peak] * 10 ** (-OFFSET_BELOW_PEAK_DB / 10);
  let offset = -1;
  for (let i = peak + 1; i < smooth.length; i++) {
    if (smooth[i] <= quiet) {
      offset = i;
      break;
    }
  }
  if (offset < 0) return null;

  // And it runs until the room reaches the noise floor. Past that the curve
  // flattens onto the microphone and reports a room several times the size of
  // the real one.
  const audible = noise * 10 ** (DECAY_ABOVE_NOISE_DB / 10);
  let limit = offset;
  for (let i = offset + 1; i < energy.length; i++) if (smooth[i] > audible) limit = i;
  if (limit - offset < MIN_FIT_FRAMES + 2) return null;

  // Schroeder: the energy still to come, from each point onward. It is
  // monotonic by construction, which is what turns a noisy decay into a line.
  // The noise floor comes off each frame before the integration. It is a
  // constant, so leaving it in adds a flat shelf to the bottom of the curve,
  // and a straight-line fit through a decay that flattens reports a room half
  // again as long as the real one — measured at 1.08s for a 0.8s room.
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

/** In-place iterative radix-2 FFT. Small enough to be worth not depending on. */
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

/**
 * Suppresses the late reverberation in a recording.
 *
 * @param {Float32Array|Float64Array|number[]} samples
 * @param {number} rate
 * @param {object} [options]
 * @param {number} [options.t60] the room, if it is already known. Measured from
 *   the recording otherwise.
 * @returns {{samples: Float32Array, t60: number}|null} null when there is
 *   nothing worth doing, in which case keep what you had.
 */
export function dereverb(samples, rate, options = {}) {
  if (!samples?.length || !(rate > 0)) return null;

  const measured = options.t60 ?? estimateT60(samples, rate)?.t60 ?? null;
  if (measured === null) return null;
  // A dry take is not a failure. It is a take with nothing to remove, and
  // running it through a subtraction anyway can only cost it something.
  if (measured < MIN_T60 || measured > MAX_T60) return null;

  const size = nextPowerOfTwo(Math.round((WINDOW_MS / 1000) * rate));
  const hop = Math.max(1, Math.floor(size / OVERLAP));
  if (samples.length < size * 2) return null;

  // Hann, applied on the way in and again on the way out. Two half-windows
  // multiply to a whole one, and at a quarter hop those sum to a constant, so
  // overlap-add reconstructs a signal nothing was done to exactly.
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

  // How much quieter the room is, one delay later. This single number is the
  // whole model of the room: α is its decay rate, and the tail arriving now is
  // what was said `delay` ago, down by this much.
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
      // Smoothed across time, never across frequency: a bin that jumps between
      // fully open and the floor from one frame to the next is the "musical
      // noise" that makes spectral subtraction sound worse than what it removed.
      gain = GAIN_SMOOTHING * previousGain[k] + (1 - GAIN_SMOOTHING) * gain;
      previousGain[k] = gain;
      realParts[index] *= gain;
      imagParts[index] *= gain;
    }

    for (let k = 0; k < bins; k++) {
      re[k] = realParts[f * bins + k];
      im[k] = imagParts[f * bins + k];
    }
    // The half of the spectrum the real FFT did not store, restored by
    // symmetry so the inverse comes back real.
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
    // Where the windows do not sum to one — the first and last half-window —
    // the original is kept rather than divided by a number near zero.
    cleaned[i] = weight[i] > 1e-3 ? out[i] / weight[i] : samples[i];
  }
  return { samples: cleaned, t60: measured };
}
