import manifest from '../../content/tiles.json';
import { artName } from './games.js';

/**
 * The picture on each menu tile.
 *
 * One per game, drawn by tools/make-tile-art.mjs and committed.
 *
 * These are the model's pictures. A tile without one — because it was never
 * generated, because it has not loaded yet, or because its Urdu came back wrong
 * and it was taken out of the manifest — falls back to the drawing in
 * src/lib/tile-faces.js. Both look like the same app; the generated ones are
 * richer and the drawn ones are always right about the letter.
 *
 * The manifest is imported rather than fetched, like images.js and
 * backdrops.js: it is a small map of names to paths, and having it
 * synchronously is what lets the menu decide in `preload()` what to queue.
 */

const BASE = import.meta.env.BASE_URL ?? '/';

/** Texture key for a tile's picture. Namespaced so it cannot collide. */
const tileArtKey = (name) => `tile-art:${name}`;

/**
 * What a game's picture is filed under.
 *
 * The scene key, except for the tile that opens the panel of extra games —
 * that one starts no scene, so it carries an explicit `art` instead.
 */
export function hasTileArt(game) {
  return Boolean(manifest.tiles?.[artName(game)]);
}

/**
 * Public URL for the picture a game's menu tile uses.
 *
 * Settings is ordinary DOM rather than a Phaser scene, so it cannot read the
 * texture cache. Giving it the manifest URL keeps its game chooser tied to the
 * exact same asset as the menu instead of maintaining a second picture list.
 */
export function tileArtUrl(game) {
  const file = manifest.tiles?.[artName(game)];
  return file ? BASE + file : null;
}

/**
 * Queues the pictures for a set of tiles. Call from `preload()`.
 *
 * The whole set, unlike the backdrops, which are loaded one screen at a time:
 * these are all on screen at once, and a menu that fills in tile by tile as a
 * child is already reaching for one is worse than a menu that takes another
 * moment to arrive. About 10 KB each.
 */
export function queueTileArt(scene, games) {
  for (const game of games) {
    const file = manifest.tiles?.[artName(game)];
    if (!file) continue;
    const key = tileArtKey(artName(game));
    if (scene.textures.exists(key)) continue;
    scene.load.image(key, BASE + file);
  }
}

/**
 * A tile's picture as something a canvas can draw, or null.
 *
 * The decoded image rather than a Phaser game object: the menu paints the whole
 * face of a tile into one texture instead of stacking sprites, so what it needs
 * here is a drawImage source. See game-tile.js.
 *
 * Null when the game has no picture and also when it has one that has not
 * loaded, so the caller falls back to the letter rather than showing Phaser's
 * missing-texture square.
 *
 * @returns {HTMLImageElement|HTMLCanvasElement|null}
 */
export function tileArtImage(scene, game) {
  const key = tileArtKey(artName(game));
  if (!scene.textures.exists(key)) return null;
  return scene.textures.get(key).getSourceImage();
}
