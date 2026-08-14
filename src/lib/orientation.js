import './orientation.css';

/**
 * Which way up the app is held.
 *
 * The games are drawn at 1280×720 and scaled to fit, so upright they would
 * letterbox into a strip across the middle of the phone — unplayable for a
 * three-year-old aiming at balloons. The installed app therefore asks to be
 * held sideways.
 *
 * ## Why this is not just a line in the manifest
 *
 * It was: `orientation: 'landscape'`. That works, and it is absolute — an
 * installed app locked that way can never turn, including on the grown-ups
 * screens, where the tracing editor wants a tall window and a finger. So the
 * manifest asks for nothing, and the lock is applied here instead and
 * *released* while Settings is open.
 *
 * ## Where the lock does not exist
 *
 * `screen.orientation.lock` is Android and desktop. iOS Safari has never
 * shipped it, so on an iPhone or iPad nothing below can hold the app sideways
 * and a child could open a game upright.
 *
 * Rather than pretend otherwise, that case gets a card asking for the phone to
 * be turned — no text, because the person looking at it cannot read yet, just
 * a phone that tips over and back. It only ever covers a game; the grown-ups
 * screens are meant to be usable either way round, which is the whole point of
 * releasing the lock.
 */

/** Whether this browser can hold the app in one orientation at all. */
export const canLock = () => typeof screen !== 'undefined' && typeof screen.orientation?.lock === 'function';

const isPortrait = () =>
  typeof window !== 'undefined' && window.matchMedia?.('(orientation: portrait)').matches;

/**
 * Whether asking for the device to be turned makes any sense.
 *
 * A desktop Chrome refuses `lock()` outside fullscreen, so without this a
 * window dragged taller than it is wide would be covered by a card telling
 * somebody to rotate their monitor. A coarse pointer means a finger, and a
 * finger means a device that can actually be turned.
 */
const isTurnable = () =>
  typeof window !== 'undefined' && window.matchMedia?.('(pointer: coarse)').matches;

/** True while a grown-up has the settings screen open. */
let released = false;
/** Whether the last lock attempt was accepted. */
let locked = false;
let card = null;

/**
 * Asks to be held sideways.
 *
 * Rejections are swallowed and are not a fault: a browser tab refuses unless
 * the page is fullscreen, and iOS has no such method at all. Both end up
 * showing the card instead.
 */
export async function lockLandscape() {
  released = false;
  if (canLock()) {
    try {
      await screen.orientation.lock('landscape');
      locked = true;
      update();
      return true;
    } catch {
      locked = false;
    }
  }
  update();
  return false;
}

/**
 * Lets the phone turn again, for as long as the grown-ups screens are open.
 *
 * The card goes away with it — on a screen that is meant to work upright,
 * "please turn your phone" would be telling somebody off for doing the right
 * thing.
 */
export function releaseOrientation() {
  released = true;
  locked = false;
  try {
    screen.orientation?.unlock?.();
  } catch {
    // Unlocking a lock that was never granted throws in some builds, and there
    // is nothing to do about it.
  }
  update();
}

function build() {
  if (card) return card;
  card = document.createElement('div');
  card.className = 'turn-card';
  card.setAttribute('role', 'img');
  card.setAttribute('aria-label', 'Turn your phone sideways');
  card.innerHTML = `
    <div class="turn-phone">
      <span class="turn-screen"></span>
    </div>
    <div class="turn-arrow" aria-hidden="true">⟳</div>`;
  document.body.appendChild(card);
  return card;
}

/** Shows or hides the card. Cheap enough to call on every orientation change. */
function update() {
  const wanted = !released && !locked && isTurnable() && isPortrait();
  if (!wanted) {
    card?.classList.remove('is-on');
    return;
  }
  build().classList.add('is-on');
}

/**
 * Starts watching. Called once at startup.
 *
 * The lock is attempted here and again after the first tap: Chrome grants it
 * to an installed app immediately, but a browser tab wants a user gesture, and
 * trying twice costs nothing.
 */
export function watchOrientation() {
  if (typeof window === 'undefined') return;
  window.matchMedia('(orientation: portrait)').addEventListener('change', update);
  window.addEventListener('resize', update);
  lockLandscape();
  window.addEventListener('pointerdown', () => !released && lockLandscape(), { once: true });
}
