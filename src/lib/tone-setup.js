/* One Tone.js, one AudioContext, loaded once and shared. */

/** @type {Promise<*>|null} */
let loading = null;
/** @type {AudioContext|null} */
let sharedContext = null;

/* Notes the context to use. */
export function useAudioContext(ctx) {
  sharedContext = ctx ?? null;
}

/** Loads Tone with the app's shared audio context.
 * @returns {Promise<*>} the Tone namespace
 */
export function loadTone() {
  loading ??= import('tone').then((Tone) => {
    // The second argument disposes whatever context Tone was using, and it matters.
    if (sharedContext) Tone.setContext(sharedContext, true);
    return Tone;
  });
  return loading;
}

/* The context everything is running on, or null before startup. */
export function audioContext() {
  return sharedContext;
}

/** A rendered Tone buffer, as plain arrays a preview tool can write to a file.
 * @returns {{sampleRate:number, channels:Float32Array[]}}
 */
export function renderedChannels(buffer) {
  return {
    sampleRate: buffer.sampleRate,
    channels: Array.from({ length: buffer.numberOfChannels }, (_, c) =>
      buffer.getChannelData(c)
    ),
  };
}
