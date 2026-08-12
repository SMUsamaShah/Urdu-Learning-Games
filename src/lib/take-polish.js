/**
 * Tidies a recording after it has been made: trims the silence, evens the level.
 *
 * Both of these have to happen after capture rather than through microphone
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
 * It does not trim flush. A consonant that starts quietly gets clipped by an
 * aggressive gate, and Urdu has plenty of those, so the bounds are found with a
 * threshold well below the peak and then padded outwards, with a short fade so
 * the cut edges do not click.
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

/** Anything this far below the loudest moment counts as silence. */
const FLOOR_DB = -38;
/** RMS window for finding the edges. Long enough to ignore a single click. */
const WINDOW_MS = 10;
/** Kept either side of the speech. Generous: a clipped consonant is worse. */
const PAD_START_MS = 60;
const PAD_END_MS = 130;
/** Fade across the cut, so the edges do not click. */
const FADE_MS = 12;
/** Loudest sample after levelling. Short of 1.0, leaving room for the encoder. */
const TARGET_PEAK = 0.89;
/** A take shorter than this is assumed to be a misfire, and is left alone. */
const MIN_SPEECH_MS = 120;
/**
 * The most a take may be turned up. Past about this the room comes up with the
 * voice, and a hissy clip is worse than a quiet one.
 */
const MAX_GAIN = 6;

/**
 * Finds where the speech starts and ends, in samples.
 *
 * Works on a short RMS rather than on individual samples: a single stray click
 * in an otherwise silent lead-in would otherwise anchor the start to the click.
 */
function findSpeech(buffer) {
  const data = buffer.getChannelData(0);
  const rate = buffer.sampleRate;
  const window = Math.max(1, Math.round((WINDOW_MS / 1000) * rate));

  let peak = 0;
  for (let i = 0; i < data.length; i++) {
    const v = Math.abs(data[i]);
    if (v > peak) peak = v;
  }
  if (peak <= 0) return null;

  const threshold = peak * 10 ** (FLOOR_DB / 20);
  const loud = (from) => {
    let sum = 0;
    const to = Math.min(data.length, from + window);
    for (let i = from; i < to; i++) sum += data[i] * data[i];
    return Math.sqrt(sum / Math.max(1, to - from)) > threshold;
  };

  let start = 0;
  while (start < data.length && !loud(start)) start += window;
  if (start >= data.length) return null;

  let end = data.length - window;
  while (end > start && !loud(end)) end -= window;
  end = Math.min(data.length, end + window);

  return { start, end, peak };
}

/** A new buffer holding just the speech, padded, faded and levelled. */
function trimAndLevel(ctx, buffer, bounds) {
  const rate = buffer.sampleRate;
  const pad = (ms) => Math.round((ms / 1000) * rate);
  const start = Math.max(0, bounds.start - pad(PAD_START_MS));
  const end = Math.min(buffer.length, bounds.end + pad(PAD_END_MS));
  const length = end - start;
  if (length < pad(MIN_SPEECH_MS)) return null;

  // Never turn a take down, only up, and never past MAX_GAIN. Unbounded gain on
  // a near-silent take just amplifies the room.
  const gain = Math.min(TARGET_PEAK / bounds.peak, MAX_GAIN);
  const fade = Math.min(pad(FADE_MS), Math.floor(length / 4));

  const out = ctx.createBuffer(buffer.numberOfChannels, length, rate);
  for (let c = 0; c < buffer.numberOfChannels; c++) {
    const from = buffer.getChannelData(c);
    const to = out.getChannelData(c);
    for (let i = 0; i < length; i++) {
      let v = from[start + i] * gain;
      if (i < fade) v *= i / fade;
      else if (i > length - fade) v *= (length - i) / fade;
      to[i] = Math.max(-1, Math.min(1, v));
    }
  }
  return { buffer: out, gain };
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
 * Trims and levels a take.
 *
 * @param {AudioContext} ctx the app's context
 * @param {Blob} blob the take as recorded
 * @param {string} mime the container to write back
 * @returns {Promise<{blob: Blob, removedMs: number, gain: number}|null>} null
 *   when nothing could usefully be done, in which case keep the original.
 */
export async function polishTake(ctx, blob, mime) {
  if (!ctx || !blob?.size) return null;
  try {
    const decoded = await ctx.decodeAudioData(await blob.arrayBuffer());
    const bounds = findSpeech(decoded);
    if (!bounds) return null;

    const trimmed = trimAndLevel(ctx, decoded, bounds);
    if (!trimmed) return null;

    const encoded = await encode(ctx, trimmed.buffer, mime);
    if (!encoded?.size) return null;

    return {
      blob: encoded,
      removedMs: Math.round((decoded.duration - trimmed.buffer.duration) * 1000),
      gain: trimmed.gain,
    };
  } catch {
    // Anything at all going wrong here means keeping the take as recorded.
    return null;
  }
}
