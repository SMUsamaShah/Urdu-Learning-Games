/**
 * Home-screen install prompt.
 *
 * `beforeinstallprompt` fires once, early, and often before any scene exists,
 * so it is captured at module load and held until something asks for it.
 *
 * Browsers that do not implement it (Safari, where installing is a manual
 * Share → Add to Home Screen) simply never offer one, and the app shows no
 * affordance rather than instructions nobody will follow.
 */

/** @type {Event & {prompt: () => Promise<void>}|null} */
let deferred = null;
let installed = false;
const listeners = new Set();

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (event) => {
    // Suppress the browser's own banner so the app can offer it in its own
    // place, at its own size.
    event.preventDefault();
    deferred = event;
    listeners.forEach((fn) => fn(true));
  });

  window.addEventListener('appinstalled', () => {
    installed = true;
    deferred = null;
    listeners.forEach((fn) => fn(false));
  });
}

/** Whether an install prompt is available to show right now. */
export function canInstall() {
  return Boolean(deferred) && !installed && !isStandalone();
}

/** True when already running as an installed app. */
export function isStandalone() {
  if (typeof window === 'undefined') return false;
  return (
    window.matchMedia?.('(display-mode: standalone)').matches ||
    window.navigator.standalone === true
  );
}

/** Subscribe to availability changes. Returns an unsubscribe function. */
export function onInstallAvailability(callback) {
  listeners.add(callback);
  return () => listeners.delete(callback);
}

/** Shows the browser's install dialog. Resolves once the user has answered. */
export async function promptInstall() {
  if (!deferred) return false;
  const event = deferred;
  // A prompt can only be used once.
  deferred = null;
  listeners.forEach((fn) => fn(false));
  try {
    await event.prompt();
    const choice = await event.userChoice;
    return choice?.outcome === 'accepted';
  } catch {
    return false;
  }
}
