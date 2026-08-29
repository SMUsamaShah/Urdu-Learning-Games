/* Picking a letter up and putting it somewhere. */

import Phaser from 'phaser';
import * as sfx from './sfx.js';

/* How near a drop has to be, in pixels, before it counts as landing on something. */
export const SNAP = 130;

/* While it is being carried: above everything, and a little bigger. */
const LIFT_DEPTH = 60;
const LIFT_SCALE = 1.12;

/** Arms a scene for dragging.
 * @param {Phaser.Scene} scene
 * @param {object} handlers
 * @param {(tile: *) => boolean} [handlers.canLift] false to refuse the drag
 * @param {(tile: *) => void} [handlers.onLift]
 * @param {(tile: *) => void} handlers.onDrop
 */
export function armDragging(scene, { canLift = () => true, onLift, onDrop }) {
  scene.input.on('dragstart', (pointer, tile) => {
    if (!canLift(tile)) return;
    tile.dragging = true;
    sfx.tap();
    tile.idle?.stop();
    tile.pulse?.stop();
    tile.setDepth(LIFT_DEPTH);
    scene.tweens.add({
      targets: tile,
      scale: (tile.homeScale ?? 1) * LIFT_SCALE,
      duration: 120,
      ease: 'Quad.easeOut',
    });
    onLift?.(tile);
  });

  scene.input.on('drag', (pointer, tile, x, y) => {
    if (!tile.dragging) return;
    tile.setPosition(x, y);
  });

  scene.input.on('dragend', (pointer, tile) => {
    if (!tile.dragging) return;
    tile.dragging = false;
    onDrop(tile);
  });
}

/* Makes one thing draggable and remembers where it started. */
export function carry(scene, tile) {
  tile.homeX = tile.x;
  tile.homeY = tile.y;
  tile.homeScale = tile.scale ?? 1;
  tile.setInteractive({ draggable: true, useHandCursor: true });
  scene.input.setDraggable(tile);
  return tile;
}

/* Back where it came from, with a bounce. */
export function swimHome(scene, tile, { onArrive } = {}) {
  scene.tweens.killTweensOf(tile);
  tile.setDepth(0);
  scene.tweens.add({
    targets: tile,
    x: tile.homeX,
    y: tile.homeY,
    scale: tile.homeScale ?? 1,
    duration: 260,
    ease: 'Back.easeOut',
    onComplete: () => onArrive?.(tile),
  });
}

/** Which of `targets` a tile was dropped on, or null.
 * @param {{x: number, y: number}[]} targets
 * @param {{x: number, y: number}} tile
 * @param {number} [radius]
 */
export function nearest(targets, tile, radius = SNAP) {
  let best = null;
  let bestDistance = radius;
  for (const target of targets) {
    const distance = Phaser.Math.Distance.Between(tile.x, tile.y, target.x, target.y);
    if (distance <= bestDistance) {
      best = target;
      bestDistance = distance;
    }
  }
  return best;
}

/* The refusal: the target shakes it off and the tile goes home. */
export function refuse(scene, tile, target) {
  if (target) {
    const from = target.x0 ?? target.x;
    scene.tweens.add({
      targets: target,
      x: from + 10,
      duration: 60,
      yoyo: true,
      repeat: 2,
      ease: 'Sine.easeInOut',
      onComplete: () => target.setX(from),
    });
  }
  swimHome(scene, tile);
}
