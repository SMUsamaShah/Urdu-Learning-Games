/* Browser fullscreen, separate from the landscape lock. */

/* Whether this browser has the Fullscreen API entry point we need. */
export function canFullscreen() {
  return typeof document !== 'undefined' &&
    typeof document.documentElement?.requestFullscreen === 'function';
}

/* Whether the page is currently fullscreen. */
export function isFullscreen() {
  return typeof document !== 'undefined' && Boolean(document.fullscreenElement);
}

/** Enters fullscreen if possible.
 * @returns {Promise<boolean>} whether the document is fullscreen afterwards
 */
export async function enterFullscreen() {
  if (!canFullscreen()) return false;
  if (isFullscreen()) return true;
  try {
    await document.documentElement.requestFullscreen();
    return isFullscreen();
  } catch {
    return false;
  }
}

/** Leaves fullscreen if possible.
 * @returns {Promise<boolean>} whether the document is not fullscreen afterwards
 */
export async function exitFullscreen() {
  if (typeof document === 'undefined') return true;
  if (!isFullscreen()) return true;
  try {
    await document.exitFullscreen?.();
    return !isFullscreen();
  } catch {
    return false;
  }
}

/* Toggles fullscreen from a user gesture. */
export function toggleFullscreen() {
  return isFullscreen() ? exitFullscreen() : enterFullscreen();
}

/* Repaints something when browser chrome enters or leaves fullscreen. */
export function onFullscreenChange(callback) {
  if (typeof document === 'undefined') return () => {};
  document.addEventListener('fullscreenchange', callback);
  return () => document.removeEventListener('fullscreenchange', callback);
}
