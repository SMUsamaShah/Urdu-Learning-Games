/**
 * Picking a letter up and putting it somewhere.
 *
 * ## Why the games that have a place for a letter should be drags
 *
 * Tapping a tray letter and watching it fly to the right slot is easier to
 * build and easier to play, and it is a different act from putting a thing
 * where it goes. The child who taps is choosing; the child who drags is
 * *placing*, and placing is the thing these games are about. It is also, at
 * three, a hand skill worth having.
 *
 * So every screen with a hole in it carries its letters: build the word, the
 * missing letter, the caterpillar and the counting line. The screens that ask
 * *which one is this* keep their tap, because there is nowhere to drop and
 * inventing a target to drag onto would be a worse game.
 *
 * ## Forgiving, on purpose
 *
 * Two rules, and both are about the fact that a three-year-old's drag ends
 * wherever their finger leaves the glass:
 *
 *   - **The snap radius is large.** A drop is judged by which target is
 *     nearest, not by whether it landed inside anything.
 *   - **A miss costs nothing.** Anything dropped in mid-air swims back to
 *     where it came from. Nothing is ever left floating, and nothing is lost.
 *
 * ## One place, because it was three
 *
 * The letter puzzle and the sorting baskets each grew their own copy of this —
 * the same scene-level `dragstart`/`drag`/`dragend`, the same `homeX`/`homeY`,
 * the same lift in depth and scale — and by the third copy the two had already
 * drifted on which of them stops the idle bob.
 */

import Phaser from 'phaser';
import * as sfx from './sfx.js';

/**
 * How near a drop has to be, in pixels, before it counts as landing on
 * something.
 *
 * Generous. A tight radius makes the game about fingers rather than about
 * letters, and the cost of being generous is only that a drop between two slots
 * picks the closer one — which is what somebody watching would have said it
 * was aimed at anyway.
 */
export const SNAP = 130;

/**
 * While it is being carried: above everything, and a little bigger.
 *
 * The lift is what makes a dragged thing feel picked *up* rather than smeared
 * along the glass, and it is also practical — a tile at its resting size sits
 * under the child's own fingertip.
 */
const LIFT_DEPTH = 60;
const LIFT_SCALE = 1.12;

/**
 * Arms a scene for dragging. Call once from `create()`.
 *
 * One set of handlers for the scene rather than one per tile: Phaser emits
 * these on the input plugin, so per-object listeners would each fire for every
 * drag on screen.
 *
 * @param {Phaser.Scene} scene
 * @param {object} handlers
 * @param {(tile: *) => boolean} [handlers.canLift] false to refuse the drag —
 *   a placed piece, a used tray tile, a locked board
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

/**
 * Makes one thing draggable and remembers where it started.
 *
 * `homeX`/`homeY` are read back by `swimHome`, so anything that moves a tile's
 * resting place — a tray being re-laid-out — has to update them too.
 */
export function carry(scene, tile) {
  tile.homeX = tile.x;
  tile.homeY = tile.y;
  tile.homeScale = tile.scale ?? 1;
  tile.setInteractive({ draggable: true, useHandCursor: true });
  scene.input.setDraggable(tile);
  return tile;
}

/**
 * Back where it came from, with a bounce.
 *
 * The bounce is not decoration: a tile that slides back linearly reads as the
 * game undoing something the child did, and one that springs back reads as the
 * tile not having stuck. The second is true and the first is not.
 */
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

/**
 * Which of `targets` a tile was dropped on, or null.
 *
 * Nearest wins rather than first-inside, so two slots side by side divide the
 * space between them instead of one of them shadowing the other.
 *
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

/**
 * The refusal: the target shakes it off and the tile goes home.
 *
 * Refused rather than punished. Nothing is taken away, nothing is counted
 * against anybody, and the letter is back in the tray to be tried again.
 */
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
