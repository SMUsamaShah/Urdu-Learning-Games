import manifest from '../../content/tiles.json';
import { artName } from './games.js';

/* The picture on each menu tile. */

const BASE = import.meta.env.BASE_URL ?? '/';

/* Texture key for a tile's picture. */
const tileArtKey = (name) => `tile-art:${name}`;

/* What a game's picture is filed under. */
export function hasTileArt(game) {
  return Boolean(manifest.tiles?.[artName(game)]);
}

/* Public URL for the picture a game's menu tile uses. */
export function tileArtUrl(game) {
  const file = manifest.tiles?.[artName(game)];
  return file ? BASE + file : null;
}

/* Queues the pictures for a set of tiles. */
export function queueTileArt(scene, games) {
  for (const game of games) {
    const file = manifest.tiles?.[artName(game)];
    if (!file) continue;
    const key = tileArtKey(artName(game));
    if (scene.textures.exists(key)) continue;
    scene.load.image(key, BASE + file);
  }
}

/** A tile's picture as something a canvas can draw, or null.
 * @returns {HTMLImageElement|HTMLCanvasElement|null}
 */
export function tileArtImage(scene, game) {
  const key = tileArtKey(artName(game));
  if (!scene.textures.exists(key)) return null;
  return scene.textures.get(key).getSourceImage();
}
