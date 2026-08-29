/* The painted backdrop each screen sits on. */

import manifest from '../../content/backgrounds.json';

const BASE = import.meta.env.BASE_URL ?? '/';

/* Texture key for a scene's backdrop. */
const backdropKey = (sceneKey) => `backdrop:${sceneKey}`;

/* Whether this scene has a painted backdrop at all. */
export function hasBackdrop(sceneKey) {
  return Boolean(manifest.scenes?.[sceneKey]);
}

/* Queues a scene's own backdrop on its loader. */
export function queueBackdrop(scene) {
  const file = manifest.scenes?.[scene.scene.key];
  if (!file) return;
  const key = backdropKey(scene.scene.key);
  if (scene.textures.exists(key)) return;
  scene.load.image(key, BASE + file);
}

/** The backdrop as an image filling the design surface, or null.
 * @returns {Phaser.GameObjects.Image|null}
 */
export function addBackdrop(scene, width, height) {
  const key = backdropKey(scene.scene.key);
  if (!scene.textures.exists(key)) return null;

  // Cover, not stretch.
  const source = scene.textures.get(key).getSourceImage();
  const scale = Math.max(width / source.width, height / source.height);
  return scene.add
    .image(width / 2, height / 2, key)
    .setOrigin(0.5, 0.5)
    .setDisplaySize(source.width * scale, source.height * scale);
}
