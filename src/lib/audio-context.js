/* The app's single AudioContext, and how big a buffer it asks for. */

const KEY = 'urdu:audio-latency';

/* The buffer sizes worth offering. */
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

const DEFAULT_LATENCY = 'balanced';

/* The chosen mode, remembered across visits. */
export function latencyMode() {
  try {
    const stored = localStorage.getItem(KEY);
    return LATENCY_MODES[stored] ? stored : DEFAULT_LATENCY;
  } catch {
    // Private browsing can refuse localStorage entirely.
    return DEFAULT_LATENCY;
  }
}

/* Records a new choice. */
export function setLatencyMode(mode) {
  if (!LATENCY_MODES[mode]) return;
  try {
    localStorage.setItem(KEY, mode);
  } catch {
    /* nothing to do; it just will not be remembered */
  }
}

/** Builds the shared audio context.
 * @returns {AudioContext|null} The context, or null when Web Audio is unavailable.
 */
export function createAppAudioContext() {
  const Ctor = window.AudioContext || window.webkitAudioContext;
  if (!Ctor) return null;
  try {
    return new Ctor({ latencyHint: LATENCY_MODES[latencyMode()].value });
  } catch {
    // Some browsers reject the options object, so retry without it.
    try {
      return new Ctor();
    } catch {
      return null;
    }
  }
}
