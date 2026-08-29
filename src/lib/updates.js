/* Shows what the service worker is doing, in the corner. */

import { stageElement } from './turn.js';

const CHECK_EVERY_MS = 30 * 60 * 1000;

/** @type {HTMLElement|null} */
let el = null;
let hideTimer = 0;

/**
 * @param {'checking'|'downloading'|'current'|'updated'|null} state
 * @param {string} [text]
 */
function show(state, text) {
  if (!el) return;
  clearTimeout(hideTimer);
  if (!state) {
    el.hidden = true;
    return;
  }
  el.hidden = false;
  el.dataset.state = state;
  el.querySelector('.update-label').textContent = text ?? '';

  // The two resting states go away by themselves.
  if (state === 'current' || state === 'updated') {
    hideTimer = setTimeout(() => show(null), state === 'current' ? 2200 : 6000);
  }
}

/* Watches one registration for a new worker arriving. */
function watch(registration, { firstInstall }) {
  registration.addEventListener('updatefound', () => {
    const worker = registration.installing;
    if (!worker) return;
    show('downloading', firstInstall ? 'Saving for offline' : 'Updating');

    worker.addEventListener('statechange', () => {
      if (worker.state === 'installed') {
        show(firstInstall ? 'current' : 'updated',
          firstInstall ? 'Ready offline' : 'Updated');
      } else if (worker.state === 'redundant') {
        // Installed and then discarded: the download failed, or it was superseded.
        show(null);
      }
    });
  });
}

/* Asks the browser to check for a new build. */
async function check(registration, { quiet = false } = {}) {
  // Offline is this app's normal state.
  if (!navigator.onLine) {
    if (!quiet) show('current', 'Offline — cannot check');
    return 'offline';
  }
  if (!quiet) show('checking', 'Checking');
  try {
    await registration.update();
    // If an update was found, `updatefound` has already taken over the display.
    if (!quiet && el?.dataset.state === 'checking') show('current', 'Up to date');
    return 'checked';
  } catch {
    if (!quiet && el?.dataset.state === 'checking') show(null);
    return 'failed';
  }
}

/* Mounts the indicator and starts watching. */
export function mountUpdateIndicator() {
  if (el || typeof document === 'undefined') return;

  el = document.createElement('div');
  el.className = 'update-badge';
  el.hidden = true;
  el.innerHTML = '<span class="update-spinner"></span><span class="update-label"></span>';
  stageElement().appendChild(el);

  if (!('serviceWorker' in navigator)) return;

  // Read before awaiting anything.
  const firstInstall = !navigator.serviceWorker.controller;

  navigator.serviceWorker.ready.then((registration) => {
    watch(registration, { firstInstall });

    // Quiet on load: if a new build is waiting, `updatefound` will say so, and announcing "up to date" every single launch.
    check(registration, { quiet: true });

    setInterval(() => check(registration, { quiet: true }), CHECK_EVERY_MS);
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) check(registration, { quiet: true });
    });
  });

  // The plugin reloads the page when the new worker takes over.
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    show('updated', 'Updated');
  });
}

/** Checks for an update on demand, with the spinner showing.
 * @returns {Promise<'checked'|'offline'|'failed'|'unsupported'>} what actually
 */
export async function checkForUpdate() {
  if (!('serviceWorker' in navigator)) return 'unsupported';
  try {
    const registration = await navigator.serviceWorker.getRegistration();
    if (!registration) return 'unsupported';
    return await check(registration);
  } catch {
    return 'failed';
  }
}
