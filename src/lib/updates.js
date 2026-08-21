/**
 * Shows what the service worker is doing, in the corner.
 *
 * The app updates itself silently — `registerType: 'autoUpdate'`, because a
 * three-year-old is never going to tap "a new version is available". The cost
 * of that is that nobody can tell whether the thing they just opened is the
 * build they pushed or one from last week, and the only way to find out was to
 * open devtools. That is a bad position to develop from and a worse one to
 * report a bug from.
 *
 * So: a small spinner while an update is downloading, a tick when there is
 * nothing to fetch, and a moment of "updated" before the reload. Nothing here
 * changes *what* happens — it only makes it visible.
 *
 * ## Observing rather than driving
 *
 * This deliberately does not touch vite-plugin-pwa's registration API. That
 * plugin already registers the worker, already calls skipWaiting, and already
 * reloads the page when the new worker takes over; a second module trying to
 * drive the same lifecycle is how you end up with two reload paths racing each
 * other. Everything below is read-only `navigator.serviceWorker`, which works
 * the same whatever the plugin does next.
 *
 * DOM rather than a Phaser object, for the same reasons as the frame-rate
 * meter: it must not be a draw call, it must not be added to every scene, and
 * it has to keep working while the game loop is asleep.
 */

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

  // The two resting states go away by themselves. The two busy ones stay until
  // something changes them, because a spinner that vanishes on a timer while
  // the work is still going is a lie.
  if (state === 'current' || state === 'updated') {
    hideTimer = setTimeout(() => show(null), state === 'current' ? 2200 : 6000);
  }
}

/**
 * Watches one registration for a new worker arriving.
 *
 * `updatefound` fires as soon as the browser starts installing a new worker,
 * which is the moment worth showing — by the time it has installed, the reload
 * is imminent and a spinner would flash past unread.
 *
 * Whether this is the first install or an update is decided *when the watch is
 * attached*, not when the worker finishes. By then `controller` is set either
 * way, so asking later reports every first-ever visit as "Updated" — a build
 * that has never run before, announced as a change to one that has.
 */
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
        // Installed and then discarded: the download failed, or it was
        // superseded. Either way nothing is coming, so stop spinning.
        show(null);
      }
    });
  });
}

/**
 * Asks the browser to check for a new build.
 *
 * Without this a service worker is only re-fetched on navigation, so an app
 * left open on a tablet — which is exactly how this one is used — can run an
 * old build indefinitely. Checked on a timer, and whenever the app is brought
 * back to the foreground, which is when somebody is most likely to be
 * wondering.
 */
async function check(registration, { quiet = false } = {}) {
  // Offline is this app's normal state, so "could not check" has to be
  // distinguishable from "checked, nothing new" — reporting the second when the
  // first happened is how somebody concludes they are on the latest build when
  // nobody ever asked the server.
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

/**
 * Mounts the indicator and starts watching. Safe to call once at startup
 * whether or not service workers exist — in dev they do not, and it stays
 * hidden.
 */
export function mountUpdateIndicator() {
  if (el || typeof document === 'undefined') return;

  el = document.createElement('div');
  el.className = 'update-badge';
  el.hidden = true;
  el.innerHTML = '<span class="update-spinner"></span><span class="update-label"></span>';
  stageElement().appendChild(el);

  if (!('serviceWorker' in navigator)) return;

  // Read before awaiting anything: `ready` resolves only once a worker is
  // active, by which point a first install looks identical to an update.
  const firstInstall = !navigator.serviceWorker.controller;

  navigator.serviceWorker.ready.then((registration) => {
    watch(registration, { firstInstall });

    // Quiet on load: if a new build is waiting, `updatefound` will say so, and
    // announcing "up to date" every single launch is noise.
    check(registration, { quiet: true });

    setInterval(() => check(registration, { quiet: true }), CHECK_EVERY_MS);
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) check(registration, { quiet: true });
    });
  });

  // The plugin reloads the page when the new worker takes over. Saying so first
  // is the difference between the app appearing to restart itself for no reason
  // and it visibly finishing a job.
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    show('updated', 'Updated');
  });
}

/**
 * Checks for an update on demand, with the spinner showing.
 *
 * Wired to the grown-ups screen: "is this the latest?" is a question a person
 * asks deliberately, and the answer should be a visible check rather than a
 * silent one.
 *
 * @returns {Promise<'checked'|'offline'|'failed'|'unsupported'>} what actually
 *   happened, which is not the same as whether a registration was found — see
 *   the offline case in check().
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
