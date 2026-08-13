/**
 * The painted backdrop each screen sits on.
 *
 * One per scene, drawn by tools/make-backgrounds.mjs and committed. A
 * three-year-old cannot read the ribbon that says which game this is; the
 * background is how they know they have arrived somewhere new, and giving every
 * activity its own place is a large part of why the reference apps feel like a
 * set of games rather than one game with ten modes.
 *
 * ## Falling back to the drawn scenery
 *
 * scenery.js can still paint a meadow with canvas. That is not dead code kept
 * out of sentiment: a scene with no backdrop of its own gets it, and so does
 * every scene if the pictures ever fail to load. The app has to look finished
 * either way, so nothing here is allowed to leave a screen blank.
 *
 * The manifest is imported rather than fetched, like images.js: it is a small
 * map of scene keys to paths, and having it synchronously is what lets a scene
 * decide in `preload()` whether there is anything to queue.
 */

import manifest from '../../content/backgrounds.json';

const BASE = import.meta.env.BASE_URL ?? '/';

/** Texture key for a scene's backdrop. Namespaced so it cannot collide. */
const backdropKey = (sceneKey) => `backdrop:${sceneKey}`;

/** Whether this scene has a painted backdrop at all. */
export function hasBackdrop(sceneKey) {
  return Boolean(manifest.scenes?.[sceneKey]);
}

/**
 * Queues a scene's own backdrop on its loader. Call from `preload()`.
 *
 * Each scene loads only its own — about 20 KB — rather than the set being
 * pulled in at startup. Eleven of them on the loading screen is a fifth of a
 * megabyte before the menu appears, on a first run over a phone connection,
 * for ten pictures that will not be seen for another minute. Phaser skips a
 * texture it already holds, so coming back to a screen costs nothing.
 */
export function queueBackdrop(scene) {
  const file = manifest.scenes?.[scene.scene.key];
  if (!file) return;
  const key = backdropKey(scene.scene.key);
  if (scene.textures.exists(key)) return;
  scene.load.image(key, BASE + file);
}

/**
 * The backdrop as an image filling the design surface, or null.
 *
 * Null when the scene has no backdrop, and also when it has one that has not
 * finished loading — a scene whose `preload` was never given `queueBackdrop`,
 * or a first visit where the file 404s. Callers fall back to drawing rather
 * than showing Phaser's missing-texture square.
 *
 * @returns {Phaser.GameObjects.Image|null}
 */
export function addBackdrop(scene, width, height) {
  const key = backdropKey(scene.scene.key);
  if (!scene.textures.exists(key)) return null;
  return scene.add.image(0, 0, key).setOrigin(0, 0).setDisplaySize(width, height);
}
