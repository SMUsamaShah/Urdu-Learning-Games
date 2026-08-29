/* The generated props: pictures of the furniture a game is played with. */

import manifest from '../../content/props.json';

const BASE = import.meta.env.BASE_URL ?? '/';

/* Texture key for a prop's picture. */
const propKey = (name) => `prop-art:${name}`;

/* Whether this prop has a picture at all. */
export function hasPropArt(name) {
  return Boolean(manifest.props?.[name]);
}

/* The size a prop comes out at, in design pixels, or null. */
export function propSize(name, width) {
  const entry = manifest.props?.[name];
  if (!entry) return null;
  const scale = width / entry.width;
  return { width, height: entry.height * scale };
}

/** Queues props on a scene's loader.
 * @param {Phaser.Scene} scene
 * @param {string[]} names
 */
export function queueProps(scene, names) {
  for (const name of names) {
    const entry = manifest.props?.[name];
    if (!entry) continue;
    const key = propKey(name);
    if (scene.textures.exists(key)) continue;
    scene.load.image(key, BASE + entry.file);
  }
}

/** A prop as an image, sized and centred on (x, y), or null.
 * @param {Phaser.Scene} scene
 * @param {number} x
 * @param {number} y centre, unless `bottom` is given
 * @param {string} name
 * @param {{width: number, bottom?: boolean}} spec `bottom` aligns y to the feet
 * @returns {Phaser.GameObjects.Image|null}
 */
export function addProp(scene, x, y, name, { width, bottom = false }) {
  const key = propKey(name);
  const entry = manifest.props?.[name];
  if (!entry || !scene.textures.exists(key)) return null;

  const size = propSize(name, width);
  const image = scene.add.image(x, bottom ? y - size.height / 2 : y, key).setName('prop');
  image.setDisplaySize(size.width, size.height);
  return image;
}
