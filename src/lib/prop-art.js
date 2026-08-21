/**
 * The generated props: pictures of the furniture a game is played with.
 *
 * A companion to props.js, not a replacement for it. props.js draws in code and
 * goes on drawing the props whose colour or shape the game decides — the
 * baskets, which take the game's colour so two of them can be told apart, and
 * the caterpillar, whose body is built around wherever the segments landed.
 * These are the other kind: fixed furniture that means nothing by its colour.
 * tools/make-props.mjs holds the full rule and why both props that existed
 * first fail it.
 *
 * ## Falling back to the drawing
 *
 * Every caller must cope with `null`. A prop is missing when it was never
 * generated, when its picture has not loaded yet, and when it came back with a
 * background on it and was thrown out of the manifest rather than shipped. The
 * scene keeps whatever it drew before, which is why none of the ellipses these
 * stand in front of have been deleted.
 *
 * That is the same arrangement as backdrops.js and the menu tiles: the picture
 * is the better version, the drawing is the version that cannot fail.
 *
 * ## Trimmed, so a scene places it by its own edges
 *
 * Each picture is cropped to the object in it, and the manifest carries the
 * size that came out in design pixels. So a scene says how wide it wants the
 * thing and gets an object exactly that wide, rather than an object of unknown
 * size inside a square of unknown padding. Re-rolling a prop can change its
 * shape without changing a line in any scene.
 */

import manifest from '../../content/props.json';

const BASE = import.meta.env.BASE_URL ?? '/';

/** Texture key for a prop's picture. Namespaced so it cannot collide. */
const propKey = (name) => `prop-art:${name}`;

/** Whether this prop has a picture at all. */
export function hasPropArt(name) {
  return Boolean(manifest.props?.[name]);
}

/**
 * The size a prop comes out at, in design pixels, or null.
 *
 * Exposed because a scene sometimes has to lay out around a prop before it
 * draws it — how high the ground is, where a letter should sit inside it — and
 * guessing that from the width alone means guessing the aspect ratio too.
 */
export function propSize(name, width) {
  const entry = manifest.props?.[name];
  if (!entry) return null;
  const scale = width / entry.width;
  return { width, height: entry.height * scale };
}

/**
 * Queues props on a scene's loader. Call from `preload()`.
 *
 * By name, and only the ones the scene uses, like backdrops.js: a game screen
 * should not pay for the furniture of the other twenty-four. Phaser skips a
 * texture it already holds, so coming back to a screen costs nothing.
 *
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

/**
 * A prop as an image, sized and centred on (x, y), or null.
 *
 * Named `prop` to match what props.js does, so verify-games.mjs finds the
 * generated ones with the check it already has: every prop on a screen has to
 * fit on the screen, and a picture that comes back a different shape is exactly
 * the way that stops being true without anybody noticing.
 *
 * @param {Phaser.Scene} scene
 * @param {number} x
 * @param {number} y centre, unless `bottom` is given
 * @param {string} name
 * @param {{width: number, bottom?: boolean}} spec `bottom` treats y as where
 *   the prop stands rather than its middle, which is what a scene laying things
 *   out on a ground line actually knows
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
