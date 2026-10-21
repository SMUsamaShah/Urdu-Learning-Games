/* One complete generated image per game. No lettering or scenery is composed over it. */
import manifest from '../../content/studio-tiles.json';
import { imageButton } from './image-button.js';

const BASE = import.meta.env.BASE_URL ?? '/';
const key = name => `studio:complete:${name}`;

export function queueStudioArt(scene) {
  const pictures = { ...manifest.tiles, chalo: manifest.chalo };
  for (const [name, art] of Object.entries(pictures)) {
    if (!scene.textures.exists(key(name))) scene.load.image(key(name), BASE + art.file);
  }
}

export function studioImage(scene, name) {
  return scene.textures.exists(key(name)) ? scene.textures.get(key(name)).getSourceImage() : null;
}

export function studioTileMaker(scene, size) {
  return (game, x, y, onTap) => {
    const art = manifest.tiles[game.scene];
    const button = imageButton(scene, {
      x, y, ...size, onTap, image: studioImage(scene, game.scene),
      fit: art.fit ?? 'cover', radius: art.radius ?? 30,
      fallback: game.roman, paintKey: `studio:complete:${game.scene}:${art.file}:${art.fit ?? 'cover'}:${art.radius ?? 30}`,
    });
    button.setName('tile');
    button.gameKey = game.scene;
    return button;
  };
}

export function studioChaloButton(scene, config) {
  return imageButton(scene, {
    ...config, image: studioImage(scene, 'chalo'), fit: manifest.chalo.fit,
    radius: manifest.chalo.radius, shadow: false,
    fallback: 'چلو', paintKey: `studio:complete:chalo:${manifest.chalo.file}`,
  }).setName('chalo-button');
}
