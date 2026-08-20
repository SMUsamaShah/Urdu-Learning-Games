/**
 * Tidies a recording after it has been made: takes the room off, trims the
 * silence, evens the level.
 *
 * ## Two different things are both called "the room"
 *
 * Worth separating up front, because conflating them is how this file spent
 * months claiming to do something it did not.
 *
 *   - **The noise floor** — hiss, a fridge, the street. Constant, broadband,
 *     under everything. Handled here, by measuring it and setting every
 *     threshold relative to it.
 *   - **Reverberation** — the same voice arriving again off the walls, decaying
 *     over half a second or more. Handled by src/lib/dereverb.js, which is a
 *     separate job needing a spectral method, and which did not exist until
 *     somebody asked whether the reverb fix worked and the honest answer was
 *     no. The expander below opens 14 dB above the noise floor; a reverb tail
 *     sits 10 to 25 dB below the *voice*, which on any real take is far above
 *     that, so nothing here has ever touched it.
 *
 * These have to happen after capture rather than through microphone
 * constraints, because neither is knowable while recording. You cannot trim to
 * the speech until you have heard where the speech was, and gain applied live
 * is `autoGainControl`, which is the thing that makes a take hiss.
 *
 * ## Why trimming matters more here than it looks
 *
 * A take is bracketed by however long it took to reach for the button, and the
 * app plays clips back to back — a letter's name and then its word. Two clips
 * with half a second of dead air each turn "bay ... bakri" into a stilted pause
 * a three-year-old will not wait through. Trimming is what makes a sequence of
 * separately recorded clips sound like one sentence.
 *
 * ## Everything here is measured against the noise floor, not against the peak
 *
 * This is the assumption the first version of this file got wrong, and it is
 * worth stating plainly: **a recording made on a phone contains no silence.**
 * It contains a room — a fridge, a street, the mic's own hiss — typically
 * somewhere around -40 dBFS, and the job is to find the voice in that, not to
 * find the gaps between digital zeroes.
 *
 * So the noise floor is measured from the take itself and every threshold is
 * set relative to it. A gate set relative to the loudest sample instead lands
 * *underneath* the room on any realistic recording, marks the whole take as
 * speech, and trims nothing — which is exactly what it did.
 *
 * The same assumption governs the levelling. Turning a quiet voice up turns the
 * room up with it, so the gain is capped by how loud that leaves the room, and
 * the voice is measured at a percentile rather than at its peak because the
 * loudest sample in a phone recording is usually a knock rather than a word.
 *
 * It does not trim flush, either. A consonant that starts quietly would be cut
 * by a single gate, and Urdu has plenty of those, so the speech is found with
 * one threshold and its edges are followed out with a lower one, then padded,
 * with a short fade so the cut edges do not click.
 *
 * ## Re-encoding
 *
 * The samples have to go back into the same container they came from, and the
 * only way to reach the browser's Opus encoder is to play the audio into a
 * MediaStreamDestination and record that. It costs one clip's length of real
 * time, which is a second, and it keeps the file the same size it was — a WAV
 * would be eight times bigger, on a device store that has to hold 123 of them.
 *
 * Every failure path returns the original take. A recording that came out
 * slightly long is a small problem; a recording that vanished because the
 * tidying threw is the parent's voice gone.
 */

import { dereverb } from './dereverb.js';

/**
 * Frame length for the level envelope. Long enough that one glottal pulse does
 * not read as silence, short enough to find the edge of a word.
 */
const WINDOW_MS = 20;

/**
 * Where the noise floor and the speech are read off the frame levels.
 *
 * Percentiles rather than min and max, because both extremes of a real
 * recording are accidents: the quietest frame is whatever the mic did between
 * samples, the loudest is a table knock.
 */
const NOISE_PERCENTILE = 0.15;
const SPEECH_PERCENTILE = 0.95;

/**
 * How far speech has to sit above the room before the two can be told apart.
 *
 * Below this the take is either all speech or all room, and there is no edge to
 * find. Guessing one anyway is how a gate eats the first syllable, so the take
 * is kept exactly as recorded instead.
 */
const MIN_SNR_DB = 9;

/**
 * The gate, as a position between the noise floor and the speech level, and a
 * floor under that in case the two are far apart.
 */
const ONSET_FRACTION = 0.35;
const MIN_ONSET_ABOVE_NOISE_DB = 8;

/**
 * The second, lower gate the edges are extended out to.
 *
 * A single threshold either cuts the soft start of a consonant or lets the room
 * through — Urdu has plenty of consonants that begin quietly. So the speech is
 * *found* with the high gate and its *edges* are found with this one, which is
 * the same hysteresis a noise gate uses.
 */
const RELEASE_ABOVE_NOISE_DB = 3.5;
/** How far the release gate may run outwards from the speech it found. */
const MAX_RELEASE_MS = 350;

/** Kept either side of the speech. Generous: a clipped consonant is worse. */
const PAD_START_MS = 60;
const PAD_END_MS = 130;
/** Fade across the cut, so the edges do not click. */
const FADE_MS = 12;

/**
 * What the speech is levelled to, measured at this percentile of the samples.
 *
 * Not the true peak. A phone recording usually has one sample far above the
 * rest — a lip smack, the finger leaving the button — and normalising to that
 * leaves the actual voice as quiet as it started. The 99th percentile is the
 * voice; the true peak is only used afterwards, to make sure nothing clips.
 */
const TARGET_LEVEL = 0.82;
const LEVEL_PERCENTILE = 0.99;
/** Never louder than this after gain, so the encoder has somewhere to go. */
const CEILING = 0.99;

/** A take shorter than this is assumed to be a misfire, and is left alone. */
const MIN_SPEECH_MS = 120;

/**
 * The most a take may be turned up, and how loud the room is allowed to get.
 *
 * Two separate limits. The first stops a near-silent take being amplified into
 * a wall of hiss. The second is the one that matters on a phone: turning a
 * quiet voice up turns the room up with it, so the gain is also capped at
 * whatever leaves the room below NOISE_CEILING_DB.
 *
 * Where that ceiling sits is a real trade-off and it is set deliberately loose.
 * Recording in a quiet room is not something this app can ask of anybody — it
 * is a parent with a phone, probably with the child in the room — so a ceiling
 * tight enough to guarantee a clean clip refuses to raise the level of an
 * ordinary recording at all, and a clip too quiet to hear over a playground is
 * useless in a way that a faint hiss is not. -32 dBFS under a voice at -2
 * leaves about 30 dB of headroom, which is inaudible on a phone speaker and
 * only just noticeable on headphones in a silent room.
 */
const MAX_GAIN = 6;
const NOISE_CEILING_DB = -32;

/**
 * The hiss, not the reverberation.
 *
 * A soft downward expander: anything down near the measured noise floor is
 * pushed lower, while samples that clearly belong to the voice are left alone.
 * That removes the noise you hear before and after the word without putting a
 * robot gate on it.
 *
 * It does nothing whatever to reverb, and the numbers say why: it is fully open
 * 14 dB above the noise floor — around -26 dBFS on a typical phone take — while
 * a tail off the walls of a small room sits between -12 and -27 dBFS under a
 * voice peaking at -2. See dereverb.js for the part that does.
 */
const NOISE_REDUCTION_DB = 16;
const EXPANDER_CLOSE_ABOVE_NOISE_DB = 4;
const EXPANDER_OPEN_ABOVE_NOISE_DB = 14;

/**
 * A gentle high-pass, enough to remove taps/handling rumble below speech.
 *
 * Also not a reverb control, for the avoidance of the doubt this file has
 * earned: a small room is audible from roughly 200 Hz to 2 kHz, an octave and
 * a half above anything this touches.
 */
const HIGHPASS_HZ = 75;

const dB = (amplitude) => 20 * Math.log10(Math.max(amplitude, 1e-9));

/**
 * The take with its reverberation suppressed, or null if there was none worth
 * removing.
 *
 * Runs on the whole take, **before** trimming, and that ordering is not
 * incidental: the room is measured from the decay after the word stops, and
 * trimming is precisely the step that throws that decay away. Measure first,
 * then cut.
 *
 * Every channel gets the T60 measured from the first one rather than its own.
 * These takes are mono in practice, but a stereo take whose two channels were
 * subtracted by different amounts would come apart in the middle.
 */
function removeRoom(ctx, buffer) {
  const first = dereverb(buffer.getChannelData(0), buffer.sampleRate);
  if (!first) return null;

  const out = ctx.createBuffer(buffer.numberOfChannels, buffer.length, buffer.sampleRate);
  out.getChannelData(0).set(first.samples);
  for (let c = 1; c < buffer.numberOfChannels; c++) {
    const channel = dereverb(buffer.getChannelData(c), buffer.sampleRate, { t60: first.t60 });
    out.getChannelData(c).set(channel ? channel.samples : buffer.getChannelData(c));
  }
  return { buffer: out, t60: first.t60 };
}

/** The value at a percentile of a list, which this sorts in place. */
function percentile(values, fraction) {
  values.sort((a, b) => a - b);
  const at = Math.min(values.length - 1, Math.max(0, Math.round(fraction * (values.length - 1))));
  return values[at];
}

/**
 * The RMS level of each frame of the take, in dBFS.
 *
 * Everything downstream works on this rather than on samples: the question is
 * always "is there a voice here", and that is a question about energy over a
 * few milliseconds, not about any one sample.
 */
function envelope(data, window) {
  const frames = new Float32Array(Math.max(1, Math.floor(data.length / window)));
  for (let f = 0; f < frames.length; f++) {
    let sum = 0;
    const from = f * window;
    const to = Math.min(data.length, from + window);
    for (let i = from; i < to; i++) sum += data[i] * data[i];
    frames[f] = dB(Math.sqrt(sum / Math.max(1, to - from)));
  }
  return frames;
}

/**
 * Finds where the speech starts and ends, in samples.
 *
 * The gate is set from the recording's own noise floor, and that is the whole
 * point. Setting it relative to the loudest moment instead — "anything 38 dB
 * below the peak is silence" — works only on a take that contains true digital
 * silence, which no microphone in a room ever produces. On a phone, speech
 * peaking at 0.3 puts that threshold at 0.004, well underneath a room floor of
 * about 0.01, so every frame reads as loud and nothing is trimmed at all. It
 * looked like the trimming was too timid; it was measuring the wrong thing.
 *
 * @returns {{start:number, end:number, level:number, noise:number}|null} null
 *   when the take has no findable edge, in which case it must be kept as is.
 */
function findSpeech(buffer) {
  const data = buffer.getChannelData(0);
  const rate = buffer.sampleRate;
  const window = Math.max(1, Math.round((WINDOW_MS / 1000) * rate));

  const frames = envelope(data, window);
  if (frames.length < 4) return null;

  const sorted = Array.from(frames);
  const noiseDb = percentile(sorted, NOISE_PERCENTILE);
  const speechDb = percentile(sorted, SPEECH_PERCENTILE);

  // Nothing to separate: either the take is all room, or it is speech from the
  // first sample to the last. Both are takes to leave alone.
  if (speechDb - noiseDb < MIN_SNR_DB) return null;

  const onsetDb =
    noiseDb + Math.max(MIN_ONSET_ABOVE_NOISE_DB, (speechDb - noiseDb) * ONSET_FRACTION);
  const releaseDb = noiseDb + RELEASE_ABOVE_NOISE_DB;

  let first = frames.findIndex((level) => level >= onsetDb);
  if (first < 0) return null;
  let last = frames.length - 1;
  while (last > first && frames[last] < onsetDb) last--;

  // Out to the release gate, so a consonant that starts under the onset gate is
  // not cut off at the point it became loud enough to notice.
  const slack = Math.max(1, Math.round(MAX_RELEASE_MS / WINDOW_MS));
  const floor = Math.max(0, first - slack);
  while (first > floor && frames[first - 1] >= releaseDb) first--;
  const ceiling = Math.min(frames.length - 1, last + slack);
  while (last < ceiling && frames[last + 1] >= releaseDb) last++;

  // The level the voice is actually at, read over the speech only. Silence
  // either side would drag a whole-take measurement down.
  const speech = [];
  const from = first * window;
  const to = Math.min(data.length, (last + 1) * window);
  for (let i = from; i < to; i++) speech.push(Math.abs(data[i]));
  if (!speech.length) return null;

  return {
    start: from,
    end: to,
    level: percentile(speech, LEVEL_PERCENTILE),
    noise: noiseDb,
  };
}

/** A new buffer holding just the speech, padded, faded and levelled. */
function trimAndLevel(ctx, buffer, bounds) {
  const rate = buffer.sampleRate;
  const pad = (ms) => Math.round((ms / 1000) * rate);
  const start = Math.max(0, bounds.start - pad(PAD_START_MS));
  const end = Math.min(buffer.length, bounds.end + pad(PAD_END_MS));
  const length = end - start;
  if (length < pad(MIN_SPEECH_MS)) return null;

  // The loudest sample in what is being kept, which is what the ceiling has to
  // be worked out against — not the level the voice sits at.
  let peak = 0;
  for (let c = 0; c < buffer.numberOfChannels; c++) {
    const data = buffer.getChannelData(c);
    for (let i = start; i < end; i++) peak = Math.max(peak, Math.abs(data[i]));
  }

  // Four limits, and the take gets the smallest. Bringing the voice up to the
  // target is the intent; the other three are all about not making things
  // worse — never so far that the room becomes audible, never so far that the
  // hiss on a near-silent take is amplified, and never into the ceiling.
  const gain = Math.max(
    1,
    Math.min(
      TARGET_LEVEL / Math.max(bounds.level, 1e-6),
      MAX_GAIN,
      10 ** ((NOISE_CEILING_DB - bounds.noise) / 20),
      CEILING / Math.max(peak, 1e-6)
    )
  );
  const fade = Math.min(pad(FADE_MS), Math.floor(length / 4));

  const out = ctx.createBuffer(buffer.numberOfChannels, length, rate);
  const noiseAfterGain = 10 ** (bounds.noise / 20) * gain;
  const closed = noiseAfterGain * 10 ** (EXPANDER_CLOSE_ABOVE_NOISE_DB / 20);
  const open = Math.max(
    closed * 1.1,
    noiseAfterGain * 10 ** (EXPANDER_OPEN_ABOVE_NOISE_DB / 20)
  );
  const floor = 10 ** (-NOISE_REDUCTION_DB / 20);
  const highpassAlpha = 1 / (1 + (2 * Math.PI * HIGHPASS_HZ) / rate);

  for (let c = 0; c < buffer.numberOfChannels; c++) {
    const from = buffer.getChannelData(c);
    const to = out.getChannelData(c);
    let lastIn = from[start] ?? 0;
    let lastOut = 0;
    for (let i = 0; i < length; i++) {
      const input = from[start + i] ?? 0;
      // One-pole high-pass in the sample domain. It removes rumble and button
      // taps without touching the consonant band that makes Urdu clips clear.
      const filtered = highpassAlpha * (lastOut + input - lastIn);
      lastIn = input;
      lastOut = filtered;

      let v = filtered * gain;
      const a = Math.abs(v);
      if (a < open) {
        const t = Math.max(0, Math.min(1, (a - closed) / Math.max(1e-9, open - closed)));
        // Smoothstep, so the expander eases open rather than chattering.
        const eased = t * t * (3 - 2 * t);
        v *= floor + (1 - floor) * eased;
      }

      if (i < fade) v *= i / fade;
      else if (i > length - fade) v *= (length - i) / fade;
      to[i] = Math.max(-1, Math.min(1, v));
    }
  }
  return { buffer: out, gain, noiseReductionDb: NOISE_REDUCTION_DB };
}

/**
 * Plays a buffer into a MediaRecorder to get it back as a compressed file.
 *
 * Real time, because that is the only route to the browser's own encoder. It is
 * one clip long, which is why this is worth doing at all.
 */
function encode(ctx, buffer, mime) {
  return new Promise((resolve) => {
    let recorder;
    try {
      const destination = ctx.createMediaStreamDestination();
      recorder = new MediaRecorder(
        destination.stream,
        mime && MediaRecorder.isTypeSupported(mime) ? { mimeType: mime } : undefined
      );
      const chunks = [];
      recorder.ondataavailable = (e) => e.data.size && chunks.push(e.data);
      recorder.onerror = () => resolve(null);
      recorder.onstop = () =>
        resolve(chunks.length ? new Blob(chunks, { type: recorder.mimeType || mime }) : null);

      const source = ctx.createBufferSource();
      source.buffer = buffer;
      source.connect(destination);
      // Stopped by the source ending rather than by a timer, so a slow frame
      // cannot cut the tail off.
      source.onended = () => recorder.state === 'recording' && recorder.stop();
      recorder.start();
      source.start();

      // Belt and braces: onended does not fire in every browser if the context
      // is interrupted, and a recorder left running would never resolve.
      setTimeout(
        () => recorder.state === 'recording' && recorder.stop(),
        (buffer.duration + 1) * 1000
      );
    } catch {
      resolve(null);
    }
  });
}

/**
 * Trims, reduces room noise and levels a take.
 *
 * @param {AudioContext} ctx the app's context
 * @param {Blob} blob the take as recorded
 * @param {string} mime the container to write back
 * @returns {Promise<{blob: Blob, removedMs: number, gain: number,
 *   noiseReductionDb: number, roomT60: number|null}|null>} null when nothing
 *   could usefully be done, in which case keep the original. `roomT60` is the
 *   reverberation time that was found and suppressed, or null if the take was
 *   dry enough to leave alone.
 */
export async function polishTake(ctx, blob, mime) {
  if (!ctx || !blob?.size) return null;
  try {
    const decoded = await ctx.decodeAudioData(await blob.arrayBuffer());

    // The room first, while the take still has the tail the room is measured
    // from. Declining is normal — a take made close to the mic has nothing to
    // remove — and the rest of the tidying runs on whichever buffer resulted.
    const room = removeRoom(ctx, decoded);
    const source = room?.buffer ?? decoded;

    const bounds = findSpeech(source);
    if (!bounds) return null;

    const trimmed = trimAndLevel(ctx, source, bounds);
    if (!trimmed) return null;

    const encoded = await encode(ctx, trimmed.buffer, mime);
    if (!encoded?.size) return null;

    return {
      blob: encoded,
      removedMs: Math.round((decoded.duration - trimmed.buffer.duration) * 1000),
      gain: trimmed.gain,
      noiseReductionDb: trimmed.noiseReductionDb,
      roomT60: room?.t60 ?? null,
    };
  } catch {
    // Anything at all going wrong here means keeping the take as recorded.
    return null;
  }
}
