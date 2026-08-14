/**
 * Which way up the app is held.
 *
 * The games are drawn at 1280×720, so held upright they letterbox into a band
 * across the middle of the phone — too small for a three-year-old aiming at
 * balloons. So the app asks to be held sideways, the way a mobile web game
 * does: opening it turns the screen, and you hold the phone that way.
 *
 * ## Why this is not a line in the manifest
 *
 * It was: `orientation: 'landscape'`. That works and it is absolute — an
 * installed app locked that way can never turn, including on the grown-ups
 * screens, and the tracing editor wants a tall window and a finger. So the
 * manifest asks for nothing, the lock is applied here, and it is *released*
 * while Settings is open.
 *
 * ## Fullscreen is what makes it work in a tab
 *
 * `screen.orientation.lock()` is granted to an installed app outright. In a
 * browser tab it is refused unless the document is fullscreen — so the tab gets
 * the pair every mobile web game uses: `requestFullscreen()`, then the lock,
 * both from the tap that starts the app.
 *
 * ## And where none of that is allowed, nothing happens
 *
 * No card, no overlay, no "please rotate". Somebody holding the phone upright,
 * or with rotation switched off in the system settings, still gets the app —
 * letterboxed and small, but there. Blocking the view to enforce a preference
 * is worse than the preference going unmet, and there used to be a card here
 * doing exactly that.
 */

/** True while a grown-up has the settings screen open. */
let released = false;

const coarse = () =>
  typeof window !== 'undefined' && window.matchMedia?.('(pointer: coarse)').matches;

/** The plain lock: granted to an installed app, refused in a tab. */
async function lockDirect() {
  if (typeof screen === 'undefined' || typeof screen.orientation?.lock !== 'function') {
    return false;
  }
  try {
    await screen.orientation.lock('landscape');
    return true;
  } catch {
    return false;
  }
}

/**
 * Asks to be held sideways, and takes the app fullscreen if that is what it
 * costs.
 *
 * Must be called from a user gesture — both APIs require one — which is why the
 * caller hangs it off the first tap.
 *
 * Fullscreen is only attempted where there is a finger: on a desktop it would
 * throw the browser into fullscreen to hold a window sideways nobody was going
 * to turn.
 *
 * @returns {Promise<boolean>} whether the app is now held in landscape
 */
export async function lockLandscape() {
  released = false;
  if (await lockDirect()) return true;
  if (!coarse()) return false;

  try {
    if (!document.fullscreenElement) {
      await document.documentElement.requestFullscreen?.();
    }
  } catch {
    // Refused, which happens outside a gesture. The lock below will refuse too
    // and the app carries on in whatever shape the window is.
    return false;
  }
  return lockDirect();
}

/**
 * Lets the phone turn again, for as long as the grown-ups screens are open.
 *
 * Fullscreen is *not* left: dropping out of it would resize everything under a
 * screen somebody is reading, and the point here is only that the phone may be
 * turned.
 */
export function releaseOrientation() {
  released = true;
  try {
    screen.orientation?.unlock?.();
  } catch {
    // Unlocking something that was never locked throws in some builds, and
    // there is nothing to do about it.
  }
}

/** Whether the lock is currently released for the grown-ups screens. */
export const isReleased = () => released;

/**
 * Starts asking. Called once at startup.
 *
 * Twice, because the two paths want different moments: an installed app grants
 * the lock immediately, and a tab needs the gesture. Trying at load and again
 * on the first tap covers both and costs nothing.
 */
export function watchOrientation() {
  if (typeof window === 'undefined') return;
  lockLandscape();
  window.addEventListener(
    'pointerdown',
    () => {
      if (!released) lockLandscape();
    },
    { once: true }
  );
}
