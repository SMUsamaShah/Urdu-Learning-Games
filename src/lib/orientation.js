/* Asking the phone to be held sideways. */

const coarse = () =>
  typeof window !== 'undefined' && window.matchMedia?.('(pointer: coarse)').matches;

/* The plain lock: granted to an installed app, refused in a tab. */
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

/** Asks to be held sideways, and takes the app fullscreen if that is what it costs.
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
    // Refused, which happens outside a gesture.
    return false;
  }
  return lockDirect();
}

/* Starts asking. */
export function watchOrientation() {
  if (typeof window === 'undefined') return;
  lockLandscape();
  window.addEventListener('pointerdown', () => lockLandscape(), { once: true });
}
