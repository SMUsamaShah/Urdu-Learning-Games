/* Speech playback. */

import { allKeys, getClip } from './clip-store.js';
import { duck } from './music.js';
import { masterOut } from './volume.js';

const BASE = import.meta.env.BASE_URL ?? '/';
const MANIFEST_URL = new URL('../../content/audio.json', import.meta.url).href;

/** @type {AudioContext|null} */
let ctx = null;
/** @type {{clips: Record<string,string>, missing: string[], counts: object}|null} */
let manifest = null;

/* key -> AudioBuffer, or null once known to be unavailable. */
const buffers = new Map();
/* key -> in-flight decode, so a double tap does not fetch twice. */
const pending = new Map();
/* Sources still playing, so a new selection can cut off the last one. */
let playing = new Set();
/* Which keys have a device recording. */
let deviceKeys = new Set();

async function loadAudioManifest() {
  if (manifest) return manifest;
  try {
    const response = await fetch(MANIFEST_URL);
    manifest = response.ok
      ? await response.json()
      : { clips: {}, missing: [], counts: {} };
  } catch {
    // A missing manifest is the same situation as missing clips: silent, but fully playable.
    manifest = { clips: {}, missing: [], counts: {} };
  }
  return manifest;
}

/** Gets audio ready: the manifest of bundled clips, the list of what this device has recorded, and the context to play.
 * @param {Phaser.Game} game
 */
export async function initAudio(game) {
  // NoAudioSoundManager (no Web Audio at all) has no context; stay silent.
  ctx = game?.sound?.context ?? null;
  const [, keys] = await Promise.all([loadAudioManifest(), allKeys()]);
  deviceKeys = new Set(keys);
}

/* The app's one AudioContext, borrowed from Phaser. */
export function getAudioContext() {
  return ctx;
}

/* Drops every decoded buffer and nudges the context back awake. */
export function refreshAudio() {
  buffers.clear();
  pending.clear();
  if (ctx?.state === 'suspended') ctx.resume().catch(() => {});
}

export function audioStats() {
  const counts = manifest?.counts ?? { expected: 0, recorded: 0, tts: 0, missing: 0 };
  return { ...counts, device: deviceKeys.size };
}

/* Whether a recording exists, for deciding if a speaker icon is worth showing. */
export function hasClip(key) {
  return deviceKeys.has(key) || Boolean(manifest?.clips?.[key]);
}

/* Drops a cached buffer so the next play picks up a new recording. */
export function invalidate(key) {
  buffers.delete(key);
  pending.delete(key);
  if (key === undefined) {
    buffers.clear();
    pending.clear();
  }
}

/* Called by the recorder when a device recording is added or removed. */
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
        // The key was listed but the row has gone; fall through to the bundled clip rather than going silent.
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

/* Which era of speech we are in, bumped by every stopAll(). */
let era = 0;

/* Cuts off anything currently speaking, and abandons anything still loading. */
export function stopAll() {
  era++;
  for (const source of playing) {
    try {
      source.stop();
    } catch {
      /* already ended */
    }
  }
  playing = new Set();
}

/** Plays a clip, resolving when it finishes.
 * @param {string} key e.g. "letter/be/name"
 * @param {{interrupt?: boolean}} [options]
 * @returns {Promise<boolean>} whether a sound actually played.
 */
export async function play(key, options = {}) {
  const { interrupt = true } = options;
  // Stop current audio before loading the next clip.
  if (interrupt) stopAll();
  const mine = era;

  const buffer = await bufferFor(key);
  if (!buffer || !ctx) return false;

  // Phaser resumes on first gesture, but a clip triggered from a scene transition can beat that, so nudge it.
  if (ctx.state === 'suspended') {
    try {
      await ctx.resume();
    } catch {
      return false;
    }
  }

  // Something else was asked for while this was loading.
  if (era !== mine) return false;

  // Pull the tune down underneath the voice.
  duck(buffer.duration + 0.4);

  return new Promise((resolve) => {
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(masterOut() ?? ctx.destination);
    source.onended = () => {
      playing.delete(source);
      resolve(true);
    };
    playing.add(source);
    source.start();
  });
}

/** Plays clips one after another, skipping any that are missing.
 * @param {string[]} keys
 * @param {number} [gapMs=280]
 */
export async function playSequence(keys, gapMs = 280) {
  stopAll();
  const mine = era;
  for (let i = 0; i < keys.length; i++) {
    // The gap between "bay" and "bakri" is long enough to tap something else in.
    if (era !== mine) return;
    const played = await play(keys[i], { interrupt: false });
    if (played && i < keys.length - 1) {
      await new Promise((r) => setTimeout(r, gapMs));
    }
  }
}

/* Key builders, so scenes never hand-assemble a key string. */
export const clipKeys = {
  letterName: (id) => `letter/${id}/name`,
  letterSound: (id) => `letter/${id}/sound`,
  word: (id) => `word/${id}`,
  number: (id) => `number/${id}`,
  praise: (id) => `praise/${id}`,
};
