/**
 * The world the games sit in: sky, sun, clouds, hills, ground.
 *
 * A flat background is the single thing that made this app look like a tool
 * rather than a toy. Preschool apps put their games somewhere — a park, a
 * meadow — and that backdrop does most of the work of feeling playful, before
 * any character or animation is involved.
 *
 * Everything here is drawn procedurally rather than loaded. That is not
 * cleverness for its own sake: the app has to work offline on a phone, and a
 * couple of hundred lines of arcs cost nothing next to a set of background
 * images at several screen sizes. It also means the scenery recolours by
 * changing numbers rather than by redrawing art.
 *
 * Drawn at a large negative depth so scenes can keep adding things normally
 * without thinking about layering.
 */

import { DESIGN } from './theme.js';

export const SKY = {
  top: '#8fd4f5',
  horizon: '#dff2fb',
  hillBack: 0x86c76a,
  hillFront: 0x63b04b,
  ground: 0xd9c48c,
  groundEdge: 0xc7ad70,
  sun: 0xffd75e,
  cloud: 0xffffff,
};

/** Where the grass starts, as a fraction of the design height. */
const HORIZON = 0.74;

/**
 * A vertical gradient as a texture.
 *
 * Phaser's Graphics has no gradient fill, so the sky is a 2px-wide canvas
 * stretched across the screen — the same trick the glyph rasteriser uses, and
 * far cheaper than a hundred stacked rectangles.
 */
function skyTexture(scene) {
  const key = 'scenery:sky';
  if (scene.textures.exists(key)) return key;

  const height = 256;
  const canvas = document.createElement('canvas');
  canvas.width = 2;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  const gradient = ctx.createLinearGradient(0, 0, 0, height);
  gradient.addColorStop(0, SKY.top);
  gradient.addColorStop(1, SKY.horizon);
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 2, height);

  const texture = scene.textures.createCanvas(key, 2, height);
  texture.context.drawImage(canvas, 0, 0);
  texture.refresh();
  return key;
}

/** One cloud: overlapping circles, so it reads as a cloud and not a pill. */
function drawCloud(graphics, x, y, scale) {
  graphics.fillStyle(SKY.cloud, 0.92);
  const blobs = [
    [0, 0, 34],
    [-38, 8, 26],
    [34, 10, 24],
    [-14, -18, 24],
    [18, -14, 20],
  ];
  for (const [dx, dy, r] of blobs) {
    graphics.fillCircle(x + dx * scale, y + dy * scale, r * scale);
  }
  graphics.fillRect(x - 44 * scale, y, 88 * scale, 18 * scale);
}

/**
 * Paints the backdrop into a scene.
 *
 * @param {Phaser.Scene} scene
 * @param {object} [options]
 * @param {boolean} [options.hills=true] Some screens are busy at the bottom
 *   (the flashcard letter strip, the balloon field) and read better with sky
 *   alone.
 * @param {boolean} [options.clouds=true]
 * @returns {Phaser.GameObjects.Container}
 */
export function addScenery(scene, options = {}) {
  const { hills = true, clouds = true } = options;
  const layer = scene.add.container(0, 0).setDepth(-100);

  const sky = scene.add
    .image(0, 0, skyTexture(scene))
    .setOrigin(0, 0)
    .setDisplaySize(DESIGN.width, DESIGN.height);
  layer.add(sky);

  // Sun, tucked into a corner where no game puts anything important.
  const sun = scene.add.graphics();
  sun.fillStyle(SKY.sun, 0.5);
  sun.fillCircle(140, 96, 96);
  sun.fillStyle(SKY.sun, 0.9);
  sun.fillCircle(140, 96, 62);
  layer.add(sun);

  if (clouds) {
    // Each cloud drifts on its own slow loop. Movement in the background is
    // what makes a screen feel alive while nothing is being tapped, and slow
    // enough that it never pulls attention off the game.
    for (const [x, y, scale, seconds] of [
      [280, 130, 1, 78],
      [720, 82, 0.72, 96],
      [1080, 168, 0.86, 64],
    ]) {
      const cloud = scene.add.graphics();
      drawCloud(cloud, 0, 0, scale);
      cloud.setPosition(x, y);
      layer.add(cloud);
      scene.tweens.add({
        targets: cloud,
        x: x + DESIGN.width + 200,
        duration: seconds * 1000,
        repeat: -1,
        onRepeat: () => cloud.setX(-200),
      });
    }
  }

  if (hills) {
    const y = DESIGN.height * HORIZON;
    const back = scene.add.graphics();
    back.fillStyle(SKY.hillBack, 1);
    // Overlapping ellipses rather than one arc, so the skyline has a few
    // rolls in it instead of being a single dome.
    for (const [cx, cy, rx, ry] of [
      [140, y + 30, 300, 120],
      [520, y + 44, 360, 140],
      [980, y + 26, 340, 120],
      [1280, y + 40, 300, 130],
    ]) {
      back.fillEllipse(cx, cy, rx * 2, ry * 2);
    }
    back.fillRect(0, y + 40, DESIGN.width, DESIGN.height - y);
    layer.add(back);

    const front = scene.add.graphics();
    front.fillStyle(SKY.hillFront, 1);
    for (const [cx, cy, rx, ry] of [
      [320, y + 118, 380, 110],
      [900, y + 126, 420, 116],
    ]) {
      front.fillEllipse(cx, cy, rx * 2, ry * 2);
    }
    front.fillRect(0, y + 118, DESIGN.width, DESIGN.height - y);
    layer.add(front);

    const ground = scene.add.graphics();
    ground.fillStyle(SKY.ground, 1);
    ground.fillRect(0, DESIGN.height - 54, DESIGN.width, 54);
    ground.fillStyle(SKY.groundEdge, 1);
    ground.fillRect(0, DESIGN.height - 54, DESIGN.width, 8);
    layer.add(ground);
  }

  return layer;
}
