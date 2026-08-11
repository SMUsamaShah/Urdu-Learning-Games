/**
 * Speech playback.
 *
 * Every recorded clip in the app goes through here. Clips are fetched and
 * decoded on first use and cached for the session, so the app starts fast and
 * only pays for the letters actually visited.
 *
 * Two rules shape the design:
 *
 * 1. **A missing clip is silence, never an error.** Recording ~120 clips takes
 *    a while, and the app has to stay completely playable throughout. Every
 *    call resolves whether or not a recording exists.
 *
 * 2. **Reuse Phaser's AudioContext** rather than opening a second one. Mobile
 *    browsers refuse to start audio until a user gesture, and Phaser already
 *    installs the handlers that resume its context on first touch. Borrowing
 *    its context inherits that unlock for free.
 */

const BASE = import.meta.env.BASE_URL ?? '/';
const MANIFEST_URL = new URL('../../content/audio.json', import.meta.url).href;

/** @type {AudioContext|null} */
let ctx = null;
/** @type {{clips: Record<string,string>, missing: string[], counts: object}|null} */
let manifest = null;

/** key -> AudioBuffer, or null once known to be unavailable. */
const buffers = new Map();
/** key -> in-flight decode, so a double tap does not fetch twice. */
const pending = new Map();
/** Sources still playing, so a new selection can cut off the last one. */
let playing = new Set();

export async function loadAudioManifest() {
  if (manifest) return manifest;
  try {
    const response = await fetch(MANIFEST_URL);
    manifest = response.ok
      ? await response.json()
      : { clips: {}, missing: [], counts: {} };
  } catch {
    // A missing manifest is the same situation as missing clips: silent, but
    // fully playable. Never let it stop the app from starting.
    manifest = { clips: {}, missing: [], counts: {} };
  }
  return manifest;
}

/**
 * @param {Phaser.Game} game
 */
export function initAudio(game) {
  // NoAudioSoundManager (no Web Audio at all) has no context; stay silent.
  ctx = game?.sound?.context ?? null;
}

export function audioStats() {
  return manifest?.counts ?? { expected: 0, recorded: 0, tts: 0, missing: 0 };
}

/** Whether a recording exists, for deciding if a speaker icon is worth showing. */
export function hasClip(key) {
  return Boolean(manifest?.clips?.[key]);
}

async function bufferFor(key) {
  if (buffers.has(key)) return buffers.get(key);
  if (pending.has(key)) return pending.get(key);

  const path = manifest?.clips?.[key];
  if (!path || !ctx) {
    buffers.set(key, null);
    return null;
  }

  const task = (async () => {
    try {
      const response = await fetch(BASE + path);
      if (!response.ok) throw new Error(`${response.status}`);
      const buffer = await ctx.decodeAudioData(await response.arrayBuffer());
      buffers.set(key, buffer);
      return buffer;
    } catch (error) {
      console.warn(`audio: could not load ${key} (${path})`, error);
      buffers.set(key, null);
      return null;
    } finally {
      pending.delete(key);
    }
  })();

  pending.set(key, task);
  return task;
}

/** Cuts off anything currently speaking. */
export function stopAll() {
  for (const source of playing) {
    try {
      source.stop();
    } catch {
      /* already ended */
    }
  }
  playing = new Set();
}

/**
 * Plays a clip, resolving when it finishes.
 *
 * @param {string} key e.g. "letter/be/name"
 * @param {{interrupt?: boolean}} [options] interrupt stops whatever is already
 *   speaking, which is what you want when a child taps rapidly.
 * @returns {Promise<boolean>} whether a sound actually played.
 */
export async function play(key, options = {}) {
  const { interrupt = true } = options;
  const buffer = await bufferFor(key);
  if (!buffer || !ctx) return false;

  // Phaser resumes on first gesture, but a clip triggered from a scene
  // transition can beat that, so nudge it.
  if (ctx.state === 'suspended') {
    try {
      await ctx.resume();
    } catch {
      return false;
    }
  }

  if (interrupt) stopAll();

  return new Promise((resolve) => {
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(ctx.destination);
    source.onended = () => {
      playing.delete(source);
      resolve(true);
    };
    playing.add(source);
    source.start();
  });
}

/**
 * Plays clips one after another, skipping any that are missing.
 *
 * Used for name-then-sound, where the pause between the two is part of the
 * teaching: "bay ... b".
 *
 * @param {string[]} keys
 * @param {number} [gapMs=280]
 */
export async function playSequence(keys, gapMs = 280) {
  stopAll();
  for (let i = 0; i < keys.length; i++) {
    const played = await play(keys[i], { interrupt: false });
    if (played && i < keys.length - 1) {
      await new Promise((r) => setTimeout(r, gapMs));
    }
  }
}

/** Key builders, so scenes never hand-assemble a key string. */
export const clipKeys = {
  letterName: (id) => `letter/${id}/name`,
  letterSound: (id) => `letter/${id}/sound`,
  word: (id) => `word/${id}`,
  number: (id) => `number/${id}`,
};
