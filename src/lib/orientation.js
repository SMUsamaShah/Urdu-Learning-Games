/**
 * Asking the phone to be held sideways.
 *
 * The app is landscape, always, the way a video game is. Opening it shows a
 * landscape picture and the *phone* is what turns; either way round is fine,
 * and turning it over rotates the picture with it.
 *
 * ## `'landscape'`, not `'landscape-primary'`
 *
 * That one word is what makes both sides work. Locking to the primary side
 * would pin the app to one edge of the phone and leave it upside down held the
 * other way; locking to `'landscape'` lets the OS flip 180 degrees between the
 * two and it does that on its own, with nothing here to help it.
 *
 * ## Why this is not a line in the manifest
 *
 * It was: `orientation: 'landscape'`. The manifest asks for nothing now and the
 * lock is applied here, which is the arrangement that survived the reason it
 * was set up for going away. Settings used to release it, so the phone could be
 * turned upright to trace a letter. It does not any more.
 *
 * ## Fullscreen is what makes it work in a tab
 *
 * `screen.orientation.lock()` is granted to an installed app outright. In a
 * browser tab it is refused unless the document is fullscreen — so the tab gets
 * the pair every mobile web game uses: `requestFullscreen()`, then the lock,
 * both from the tap that starts the app.
 *
 * ## Where the ask is refused, the app turns itself
 *
 * A tab that never went fullscreen, or a phone with rotation switched off in
 * system settings. There used to be nothing to do about those and the app sat
 * in a letterboxed band across the middle of the screen, which was the wrong
 * answer: it is unplayably small for a three-year-old aiming at balloons.
 *
 * So src/lib/turn.js rotates the app across the screen instead, filling it, and
 * the phone gets held sideways to read it. Still no card and still no overlay —
 * nothing is ever blocked to enforce a preference. The app simply arrives the
 * right way up for a phone held the way it is asking to be held.
 */

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
 * Starts asking. Called once at startup.
 *
 * Twice, because the two paths want different moments: an installed app grants
 * the lock immediately, and a tab needs the gesture. Trying at load and again
 * on the first tap covers both and costs nothing.
 */
export function watchOrientation() {
  if (typeof window === 'undefined') return;
  lockLandscape();
  window.addEventListener('pointerdown', () => lockLandscape(), { once: true });
}
