/* Home-screen install prompt. */

/** @type {Event & {prompt: () => Promise<void>}|null} */
let deferred = null;
let installed = false;
const listeners = new Set();

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (event) => {
    // Suppress the browser's own banner so the app can offer it in its own place, at its own size.
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

/* Whether an install prompt is available to show right now. */
export function canInstall() {
  return Boolean(deferred) && !installed && !isStandalone();
}

/* True when already running as an installed app. */
function isStandalone() {
  if (typeof window === 'undefined') return false;
  return (
    window.matchMedia?.('(display-mode: standalone)').matches ||
    window.navigator.standalone === true
  );
}

/* Subscribe to availability changes. */
export function onInstallAvailability(callback) {
  listeners.add(callback);
  return () => listeners.delete(callback);
}

/* Shows the browser's install dialog. */
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
