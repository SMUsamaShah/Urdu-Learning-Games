/* Deafening the game while a DOM screen is over it. */

/** @type {Phaser.Game|null} */
let game = null;

/* How many overlays are currently up. */
let holds = 0;

/* Tells this which game to deafen. */
export function useGameInput(instance) {
  game = instance;
  apply();
}

function apply() {
  // `game.input` *is* the InputManager; `game.input.manager` is undefined and has caught somebody here before.
  if (game?.input) game.input.enabled = holds === 0;
}

/** Stops the game hearing pointers until the returned function is called.
 * @returns {() => void} hands input back, once every hold has been released
 */
export function holdGameInput() {
  holds += 1;
  apply();
  let released = false;
  return () => {
    // Guarded because a screen can be closed twice.
    if (released) return;
    released = true;
    holds = Math.max(0, holds - 1);
    apply();
  };
}

/* How many overlays are holding it. */
export const gameInputHolds = () => holds;
