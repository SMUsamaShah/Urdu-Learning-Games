/**
 * Speech playback.
 *
 * Every recorded clip in the app goes through here. Clips are fetched and
 * decoded on first use and cached for the session, so the app starts fast and
 * only pays for the letters actually visited.
 *
 * ## Where a clip comes from
 *
 *   device (IndexedDB) → bundled (content/audio.json) → silence
 *
 * A recording made on this device beats the one shipped with the app, which is
 * the whole point of being able to record in your own voice: a child hears their
 * parent, not whoever recorded the repo. It extends the same precedence the
 * build pipeline already uses, where public/audio/recorded/ beats tts/.
 *
 * Two rules shape the rest of the design:
 *
 * 1. **A missing clip is silence, never an error.** Recording the whole set takes
 *    a while, and the app has to stay completely playable throughout. Every
 *    call resolves whether or not a recording exists.
 *
 * 2. **Reuse Phaser's AudioContext** rather than opening a second one. Mobile
 *    browsers refuse to start audio until a user gesture, and Phaser already
 *    installs the handlers that resume its context on first touch. Borrowing
 *    its context inherits that unlock for free.
 */

import { allKeys, getClip } from './clip-store.js';
import { duck } from './music.js';

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
/**
 * Which keys have a device recording. Held as a Set so hasClip() can stay
 * synchronous for the scenes that call it while drawing.
 */
let deviceKeys = new Set();

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

/** Notes which clips this device has recorded. Called once at startup. */
export async function loadDeviceClips() {
  deviceKeys = new Set(await allKeys());
  return deviceKeys;
}

/**
 * The app's one AudioContext, borrowed from Phaser.
 *
 * Anything in the app that needs Web Audio must use this rather than opening
 * its own: a second context is a second claim on the audio hardware, and on a
 * phone that is enough to make playback stutter.
 */
export function getAudioContext() {
  return ctx;
}

/**
 * Drops every decoded buffer and nudges the context back awake.
 *
 * Called after the microphone has been released. Opening a mic can move the
 * output device into its communications mode at a different sample rate, and
 * buffers decoded while that was true can play back wrong afterwards.
 */
export function refreshAudio() {
  buffers.clear();
  pending.clear();
  if (ctx?.state === 'suspended') ctx.resume().catch(() => {});
}

export function audioStats() {
  const counts = manifest?.counts ?? { expected: 0, recorded: 0, tts: 0, missing: 0 };
  return { ...counts, device: deviceKeys.size };
}

/** Whether a recording exists, for deciding if a speaker icon is worth showing. */
export function hasClip(key) {
  return deviceKeys.has(key) || Boolean(manifest?.clips?.[key]);
}

/**
 * Drops a cached buffer so the next play picks up a new recording.
 *
 * Without this, re-recording a clip keeps playing the previous take until the
 * page is reloaded, which makes the recorder feel broken.
 */
export function invalidate(key) {
  buffers.delete(key);
  pending.delete(key);
  if (key === undefined) {
    buffers.clear();
    pending.clear();
  }
}

/** Called by the recorder when a device recording is added or removed. */
export function noteDeviceClip(key, present) {
  if (present) deviceKeys.add(key);
  else deviceKeys.delete(key);
  invalidate(key);
}

async function decode(arrayBuffer) {
  return ctx.decodeAudioData(arrayBuffer);
}

async function bufferFor(key) {
  if (buffers.has(key)) return buffers.get(key);
  if (pending.has(key)) return pending.get(key);
  if (!ctx) return null;

  const task = (async () => {
    try {
      // A recording made on this device wins over the one shipped in the app.
      if (deviceKeys.has(key)) {
        const record = await getClip(key);
        if (record?.blob) {
          const buffer = await decode(await record.blob.arrayBuffer());
          buffers.set(key, buffer);
          return buffer;
        }
        // The key was listed but the row has gone; fall through to the bundled
        // clip rather than going silent.
        deviceKeys.delete(key);
      }

      const path = manifest?.clips?.[key];
      if (!path) {
        buffers.set(key, null);
        return null;
      }

      const response = await fetch(BASE + path);
      if (!response.ok) throw new Error(`${response.status}`);
      const buffer = await decode(await response.arrayBuffer());
      buffers.set(key, buffer);
      return buffer;
    } catch (error) {
      console.warn(`audio: could not load ${key}`, error);
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

  // Pull the tune down underneath the voice. This is the entire reason the
  // music module exposes a duck at all: the recorded voice saying a letter is
  // the point of the app, and a three-year-old meeting a new sound needs to
  // hear it without a melody underneath. A little longer than the clip, so the
  // music does not swell back up into the gap before the next one.
  duck(buffer.duration + 0.4);

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
