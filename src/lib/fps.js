/**
 * A frame-rate readout, for telling a rendering problem from an input one.
 *
 * Worth having as a real feature rather than a debug flag. "It feels jerky" has
 * two completely different causes — the app is dropping frames, or the app is
 * running at sixty and mishandling the input — and they need opposite fixes.
 * Without a number on screen, the two are indistinguishable by eye, and the
 * last time the two got confused here the wrong thing was optimised.
 *
 * DOM rather than a Phaser text object on purpose: it must not itself be a
 * draw call, it must not be added to every scene, and it must keep updating
 * while the game loop is asleep — which is exactly when the reading matters.
 *
 * Off by default, and remembered. It sits behind the grown-ups gate because a
 * three-year-old does not need a number in the corner.
 */

const KEY = 'urdu:show-fps';

export function showFps() {
  try {
    return localStorage.getItem(KEY) === '1';
  } catch {
    return false;
  }
}

export function setShowFps(on) {
  try {
    localStorage.setItem(KEY, on ? '1' : '0');
  } catch {
    /* private browsing; it just will not be remembered */
  }
  apply(on);
}

/** @type {HTMLElement|null} */
let el = null;

function apply(on) {
  if (!el) return;
  el.hidden = !on;
}

/**
 * Attaches the readout. Safe to call once at startup whatever the setting —
 * hidden costs nothing, and the toggle then works without a reload.
 */
export function mountFpsMeter(game) {
  if (el) return el;
  el = document.createElement('div');
  el.className = 'fps-meter';
  el.hidden = !showFps();
  document.body.appendChild(el);

  let last = 0;
  const tick = (now) => {
    requestAnimationFrame(tick);
    // Four times a second. Every frame makes the number unreadable and adds a
    // layout to each one.
    if (now - last < 250) return;
    last = now;
    if (el.hidden) return;

    const fps = game?.loop?.actualFps ?? 0;
    el.textContent = `${Math.round(fps)} fps`;
    // Green above 50, amber 30-50, red below: the point is to be readable at a
    // glance while a child is using the app, not to be precise.
    el.dataset.level = fps >= 50 ? 'good' : fps >= 30 ? 'fair' : 'poor';
  };
  requestAnimationFrame(tick);
  return el;
}
