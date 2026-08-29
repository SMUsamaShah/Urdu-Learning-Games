/* One volume for everything, and a limiter so turning it up is safe. */

const KEY = 'urdu-games:volume';

/** @type {AudioContext|null} */
let ctx = null;
/** @type {GainNode|null} */
let master = null;

/* How long a volume change takes, so a dragged slider does not click. */
const RAMP = 0.06;

function stored() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw === null) return 1;
    const value = Number(raw);
    return Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 1;
  } catch {
    // Private browsing can refuse localStorage entirely.
    return 1;
  }
}

let level = stored();

/** Builds the master chain.
 * @param {Phaser.Game} game the app, for the AudioContext it settled on
 */
export function initVolume(game) {
  ctx = game?.sound?.context ?? null;
  if (!ctx) return;

  master = ctx.createGain();
  master.gain.value = level;

  // A limiter in all but name: a compressor with a high ratio and a fast attack, sitting just under full scale.
  const limiter = ctx.createDynamicsCompressor();
  limiter.threshold.value = -3;
  limiter.knee.value = 0;
  limiter.ratio.value = 20;
  limiter.attack.value = 0.003;
  limiter.release.value = 0.25;

  master.connect(limiter);
  limiter.connect(ctx.destination);
}

/* What everything connects to instead of `ctx.destination`. */
export function masterOut() {
  return master ?? ctx?.destination ?? null;
}

/* The current level, 0 to 1. */
export const volume = () => level;

/* Sets it, and remembers it. */
export function setVolume(next) {
  level = Math.min(1, Math.max(0, Number(next) || 0));
  if (master && ctx) {
    master.gain.cancelScheduledValues(ctx.currentTime);
    master.gain.setTargetAtTime(level, ctx.currentTime, RAMP);
  }
  try {
    localStorage.setItem(KEY, String(level));
  } catch {
    // A storage failure should not prevent audio setup.
  }
  return level;
}
