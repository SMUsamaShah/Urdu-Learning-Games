/**
 * Word pictures.
 *
 * Every word in the app is a concrete noun chosen to teach a letter, so a
 * picture is what makes it mean anything to a child who cannot read yet. The
 * files are generated once by tools/make-word-images.mjs and committed; nothing
 * is drawn at runtime.
 *
 * The manifest is imported rather than fetched: it is a small map of ids to
 * paths, and having it available synchronously means a scene can decide what to
 * queue before its loader starts.
 */

import manifest from '../../content/images.json';

const BASE = import.meta.env.BASE_URL ?? '/';

/** Texture key for a word's picture. Namespaced so it cannot collide. */
export const wordImageKey = (wordId) => `word-image:${wordId}`;

export function hasWordImage(wordId) {
  return Boolean(manifest.words?.[wordId]);
}

/** Every word that has a picture. */
export function illustratedWords() {
  return Object.keys(manifest.words ?? {});
}

/**
 * Queues the given words' pictures on a scene's loader.
 *
 * Call from `preload()`. Phaser skips textures it already holds, so moving
 * between the games that use pictures costs nothing after the first load.
 *
 * @param {Phaser.Scene} scene
 * @param {string[]} [wordIds] defaults to every illustrated word.
 */
export function queueWordImages(scene, wordIds = illustratedWords()) {
  for (const id of wordIds) {
    const file = manifest.words?.[id];
    if (!file) continue;
    const key = wordImageKey(id);
    if (scene.textures.exists(key)) continue;
    scene.load.image(key, BASE + file);
  }
}

/**
 * Adds a word's picture, scaled to fit a box.
 *
 * Returns null when the word has no picture or it has not been loaded, so
 * callers can fall back rather than showing Phaser's green missing-texture
 * square — the pictures arrive word by word and the app must look finished
 * throughout.
 *
 * @returns {Phaser.GameObjects.Image|null}
 */
export function addWordImage(scene, x, y, wordId, size) {
  const key = wordImageKey(wordId);
  if (!scene.textures.exists(key)) return null;
  const image = scene.add.image(x, y, key);
  image.setDisplaySize(size, size);
  return image;
}
