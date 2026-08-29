/* Word pictures. */

import manifest from '../../content/images.json';

const BASE = import.meta.env.BASE_URL ?? '/';

/* Texture key for a word's picture. */
const wordImageKey = (wordId) => `word-image:${wordId}`;

export function hasWordImage(wordId) {
  return Boolean(manifest.words?.[wordId]);
}

/* Every word that has a picture. */
export function illustratedWords() {
  return Object.keys(manifest.words ?? {});
}

/** Queues the given words' pictures on a scene's loader.
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

/** Adds a word's picture, scaled to fit a box.
 * @returns {Phaser.GameObjects.Image|null}
 */
export function addWordImage(scene, x, y, wordId, size) {
  const key = wordImageKey(wordId);
  if (!scene.textures.exists(key)) return null;
  const image = scene.add.image(x, y, key);
  image.setDisplaySize(size, size);
  return image;
}
