/**
 * One volume for everything, and a limiter so turning it up is safe.
 *
 * Four things reach the speakers — the tune, the effects, the reward
 * flourishes and the recorded voice — and until this existed each connected
 * straight to `ctx.destination` with its own idea of level and nothing in
 * between. There was no way to turn the app down, and no way to turn it up
 * either.
 *
 * ## Measured, not guessed
 *
 * The tune was rendered offline and measured at **peak −33 dBFS, RMS −52** —
 * quiet enough to vanish under a room. The flourishes peaked 16 dB above it.
 * That spread is the actual complaint about the main screen, and the numbers
 * are in the modules that set them so the next person changing a level knows
 * what they are changing.
 *
 * ## The limiter is what makes the rest safe
 *
 * Three instruments, a reverb tail, a celebration and a spoken letter can all
 * land in the same moment. Levels chosen so that never clips would be levels
 * chosen for a case that happens once a minute, at the cost of every other
 * moment. So a compressor sits on the end, doing nothing at all until something
 * approaches full scale — a clipped tune is unpleasant in a way a quiet one is
 * not.
 */

const KEY = 'urdu-games:volume';

/** @type {AudioContext|null} */
let ctx = null;
/** @type {GainNode|null} */
let master = null;

/** How long a volume change takes, so a dragged slider does not click. */
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

/**
 * Builds the master chain. Called once at startup, before anything connects.
 *
 * @param {Phaser.Game} game the app, for the AudioContext it settled on
 */
export function initVolume(game) {
  ctx = game?.sound?.context ?? null;
  if (!ctx) return;

  master = ctx.createGain();
  master.gain.value = level;

  // A limiter in all but name: a compressor with a high ratio and a fast
  // attack, sitting just under full scale. Everything below it is untouched,
  // which is the point — this is a safety net, not a sound.
  const limiter = ctx.createDynamicsCompressor();
  limiter.threshold.value = -3;
  limiter.knee.value = 0;
  limiter.ratio.value = 20;
  limiter.attack.value = 0.003;
  limiter.release.value = 0.25;

  master.connect(limiter);
  limiter.connect(ctx.destination);
}

/**
 * What everything connects to instead of `ctx.destination`.
 *
 * Falls back to the destination itself where there is no context to build on,
 * so a caller never has to check: worst case the app is as loud as it was
 * before any of this, which is the old behaviour rather than silence.
 */
export function masterOut() {
  return master ?? ctx?.destination ?? null;
}

/** The current level, 0 to 1. */
export const volume = () => level;

/**
 * Sets it, and remembers it.
 *
 * Ramped rather than assigned: a gain jumped from one value to another mid-note
 * is an audible click, and this is called on every frame of a dragged slider.
 */
export function setVolume(next) {
  level = Math.min(1, Math.max(0, Number(next) || 0));
  if (master && ctx) {
    master.gain.cancelScheduledValues(ctx.currentTime);
    master.gain.setTargetAtTime(level, ctx.currentTime, RAMP);
  }
  try {
    localStorage.setItem(KEY, String(level));
  } catch {
    // As above: not being able to remember it is not a reason to refuse it.
  }
  return level;
}
