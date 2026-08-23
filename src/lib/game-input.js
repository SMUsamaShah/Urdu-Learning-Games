/**
 * Deafening the game while a DOM screen is over it.
 *
 * ## The leak
 *
 * Settings, the grown-ups question and the "that's enough for today" screen are
 * all HTML over the canvas. They cover it, and covering it is not enough:
 * Phaser listens for `pointerup` on the **window** rather than on the canvas,
 * so that a drag released off the edge still ends. A tap on a button in one of
 * these overlays is therefore also a tap in the game, at those coordinates —
 * and the menu's tiles open on `pointerup`.
 *
 * It is exactly as bad as it sounds. Pressing "Grown-ups" on the time-up screen
 * opened whichever game the button happened to be sitting on top of, behind the
 * overlay, while the overlay stayed up. `elementFromPoint` said the overlay had
 * the tap; Phaser had it too. Nothing but a history trace showed it, and
 * tools/verify-limit.mjs is where it finally did.
 *
 * `pointer-events: none` cannot fix this — the events are not reaching the
 * canvas in the first place — and neither can `stopPropagation` on a backdrop,
 * because window is the top of the propagation path, not below it. The only
 * thing that works is telling the input manager to stop listening.
 *
 * ## Counted, because overlays stack
 *
 * The gate opens *on top of* the time-up screen, and Settings opens on top of
 * the gate. Whoever closes first must not hand input back to a game that is
 * still covered, so this counts holds and only re-enables at zero.
 *
 * ## Not the same thing as the allowance pause
 *
 * They look alike and are asked at the same moments. This one is about taps
 * reaching the game; `pauseAllowance` in allowance.js is about whose minutes
 * are being spent. Settings wants both; the time-up screen wants only this one.
 */

/** @type {Phaser.Game|null} */
let game = null;

/** How many overlays are currently up. */
let holds = 0;

/**
 * Tells this which game to deafen. Called once at startup.
 *
 * Passed in rather than imported, because app.js builds the game and imports
 * the overlays — the other way round is a cycle.
 */
export function useGameInput(instance) {
  game = instance;
  apply();
}

function apply() {
  // `game.input` *is* the InputManager; `game.input.manager` is undefined and
  // has caught somebody here before. Its `enabled` is what every scene's input
  // plugin checks in `isActive()`, so one flag covers all thirty scenes.
  if (game?.input) game.input.enabled = holds === 0;
}

/**
 * Stops the game hearing pointers until the returned function is called.
 *
 * @returns {() => void} hands input back, once every hold has been released
 */
export function holdGameInput() {
  holds += 1;
  apply();
  let released = false;
  return () => {
    // Guarded because a screen can be closed twice — the back button and the
    // close control both call the same teardown — and a double release would
    // hand input back while another overlay was still up.
    if (released) return;
    released = true;
    holds = Math.max(0, holds - 1);
    apply();
  };
}

/** How many overlays are holding it. For the checks. */
export const gameInputHolds = () => holds;
