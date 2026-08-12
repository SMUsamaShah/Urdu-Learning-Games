/**
 * The app's single AudioContext, and how big a buffer it asks for.
 *
 * ## Why this file exists
 *
 * Phaser creates its own AudioContext with `new AudioContext()` and no
 * arguments, which means `latencyHint: 'interactive'` — the browser picks the
 * *smallest* buffer it can, to make taps feel immediate. That is the right
 * default for a game whose audio is all short blips, and the wrong one here.
 *
 * A small buffer means the audio thread has very little time to produce each
 * block of samples. When it misses that deadline the output underruns, and an
 * underrun is a click or a dropout at whatever point in the sound it happened
 * to occur. The tell is that it lands somewhere different on every play: a bad
 * recording or a bad decode is broken identically every time, but a starved
 * audio thread is broken at random.
 *
 * It is also why short interface beeps can sound perfectly clean while a
 * two-second recording of a voice sounds rough. Both drop the same fraction of
 * samples; only one of them is long enough for you to hear it happen.
 *
 * This app is a WebGL game with tweened confetti running on cheap Android
 * phones, so the audio thread has real competition. It plays recorded speech,
 * where robustness matters and a few tens of milliseconds of latency does not.
 * So it asks for a larger buffer than Phaser would.
 *
 * ## Why it is a setting
 *
 * How much buffer is enough depends entirely on the device, and no amount of
 * headless testing can find that out — the failure only appears on real
 * hardware under real load. So the choice is exposed in the sound check rather
 * than guessed at, with a default that errs towards robustness.
 */

const KEY = 'urdu:audio-latency';

/**
 * The buffer sizes worth offering.
 *
 * `interactive` is what Phaser would have picked on its own; it is kept so the
 * old behaviour can be compared against directly rather than argued about.
 */
export const LATENCY_MODES = {
  interactive: {
    label: 'Lowest delay',
    hint: 'Smallest buffer. Taps respond instantly, but speech may break up on a slower phone.',
    value: 'interactive',
  },
  balanced: {
    label: 'Balanced (recommended)',
    hint: 'A bigger buffer, at about a tenth of a second of delay. Steady without feeling laggy.',
    value: 0.1,
  },
  safe: {
    label: 'Smoothest',
    hint: 'The largest buffer the browser will give. Use if speech still breaks up.',
    value: 'playback',
  },
};

export const DEFAULT_LATENCY = 'balanced';

/** The chosen mode, remembered across visits. */
export function latencyMode() {
  try {
    const stored = localStorage.getItem(KEY);
    return LATENCY_MODES[stored] ? stored : DEFAULT_LATENCY;
  } catch {
    // Private browsing can refuse localStorage entirely.
    return DEFAULT_LATENCY;
  }
}

/**
 * Records a new choice. Takes effect on the next load, because an
 * AudioContext's buffer size is fixed when it is constructed and there is no
 * way to change it afterwards.
 */
export function setLatencyMode(mode) {
  if (!LATENCY_MODES[mode]) return;
  try {
    localStorage.setItem(KEY, mode);
  } catch {
    /* nothing to do; it just will not be remembered */
  }
}

/**
 * Builds the context the whole app shares.
 *
 * Handed to Phaser through `audio: { context }` so the page still holds exactly
 * one — a second context is a second claim on the audio hardware, and this app
 * already learned that lesson once.
 *
 * @returns {AudioContext|null} null where Web Audio does not exist at all, which
 *   leaves Phaser to fall back to its silent sound manager.
 */
export function createAppAudioContext() {
  const Ctor = window.AudioContext || window.webkitAudioContext;
  if (!Ctor) return null;
  try {
    return new Ctor({ latencyHint: LATENCY_MODES[latencyMode()].value });
  } catch {
    // Safari has historically rejected the options object outright.
    try {
      return new Ctor();
    } catch {
      return null;
    }
  }
}
