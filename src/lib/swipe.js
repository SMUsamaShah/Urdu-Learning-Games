/**
 * Telling a drag from a tap, and a flick from a nudge.
 *
 * Two screens carry a row of things you can both *choose from* and *move*: the
 * strip of letters on Flashcards, and the menu's pages of game tiles. They are
 * the same gesture right up to the moment the finger moves, and getting that
 * moment wrong is the most annoying thing either screen can do — you meant to
 * scroll past a letter and you opened it, or you meant to open a game and the
 * page slid away.
 *
 * `games-panel.js`, now deleted, refused to have a draggable list at all for
 * exactly this reason: *"a dragged list steals the drag from the tiles
 * underneath it — a child pressing a tile and moving their finger a few pixels
 * would scroll instead of choosing."* That was a fair objection to a *scrolling*
 * list. It is answered by measuring the travel and letting anything under
 * `SLOP` still count as a tap.
 *
 * ## Against the previous event, not the previous frame
 *
 * The subtlety worth not rediscovering, and the reason this is shared rather
 * than written twice. Each delta is measured against this module's own last
 * position rather than `pointer.prevPosition`, which is where the pointer was
 * at the previous *frame*: a `pointermove` that fires twice in one frame would
 * apply the same delta twice, and one that does not fire would apply nothing.
 * That is exactly what a jerky drag is made of.
 */

/**
 * How far a finger may travel and still count as a tap.
 *
 * Eight design pixels. Small enough that a deliberate drag is never mistaken
 * for a tap, generous enough for the wobble in a three-year-old's finger as it
 * lifts — which is the direction the error has to fall, since a tap that does
 * nothing reads as the app being broken and a drag that does nothing reads as
 * the child not having pushed hard enough.
 */
export const SLOP = 8;

/**
 * Watches a scene's pointer and reports what the gesture turned out to be.
 *
 * Scene-level rather than per-object: the finger frequently leaves the tile it
 * started on, which is the whole point of a drag, and a handler bound to the
 * tile stops hearing about it the moment that happens.
 *
 * @param {Phaser.Scene} scene
 * @param {object} [options]
 * @param {(pointer: Phaser.Input.Pointer) => boolean} [options.from] whether a
 *   press at this point begins a gesture at all. Flashcards uses it to ignore
 *   everything above its strip.
 * @param {(delta: number, pointer: Phaser.Input.Pointer) => void} [options.onMove]
 *   called with the horizontal travel since the last event.
 * @param {(gesture: {travel: number, flick: number}) => void} [options.onEnd]
 * @returns {{moved: () => boolean, travel: () => number, flick: () => number}}
 *   `moved()` is the one every tap handler wants: has this gesture already
 *   gone too far to be a tap?
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
    // `travel` is deliberately *not* cleared here. A tile's own `pointerup`
    // fires after this one, and it has to be able to ask whether the gesture
    // that just ended was a drag. It is reset on the next press instead.
  };
  scene.input.on('pointerup', release);
  scene.input.on('pointerupoutside', release);

  return {
    moved: () => travel > SLOP,
    travel: () => travel,
    flick: () => flick,
  };
}
