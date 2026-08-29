/* Telling a drag from a tap, and a flick from a nudge. */

/* How far a finger may travel and still count as a tap. */
export const SLOP = 8;

/** Watches a scene's pointer and reports what the gesture turned out to be.
 * @param {Phaser.Scene} scene
 * @param {object} [options]
 * @param {(pointer: Phaser.Input.Pointer) => boolean} [options.from] Whether to start tracking the pointer.
 * @param {(delta: number, pointer: Phaser.Input.Pointer) => void} [options.onMove]
 * @param {(gesture: {travel: number, flick: number}) => void} [options.onEnd]
 * @returns {{moved: () => boolean, travel: () => number, flick: () => number}}
 */
export function watchSwipe(scene, { from, onMove, onEnd } = {}) {
  let active = false;
  let travel = 0;
  let lastX = 0;
  let flick = 0;

  scene.input.on('pointerdown', (pointer) => {
    if (from && !from(pointer)) return;
    active = true;
    travel = 0;
    flick = 0;
    lastX = pointer.x;
  });

  scene.input.on('pointermove', (pointer) => {
    if (!active || !pointer.isDown) return;
    const delta = pointer.x - lastX;
    lastX = pointer.x;
    travel += Math.abs(delta);
    flick = delta;
    onMove?.(delta, pointer);
  });

  const release = () => {
    if (!active) return;
    active = false;
    onEnd?.({ travel, flick });
    // `travel` is deliberately *not* cleared here.
  };
  scene.input.on('pointerup', release);
  scene.input.on('pointerupoutside', release);

  return {
    moved: () => travel > SLOP,
    travel: () => travel,
    flick: () => flick,
  };
}
