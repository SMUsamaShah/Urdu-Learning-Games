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

import { stageElement } from './turn.js';

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
  stageElement().appendChild(el);

  let last = 0;
  const tick = (now) => {
    requestAnimationFrame(tick);
    // Four times a second. Every frame makes the number unreadable and adds a
    // layout to each one.
    if (now - last < 250) return;
    last = now;
    if (el.hidden) return;

    const fps = game?.loop?.actualFps ?? 0;
    // With what it took to draw it. A frame rate on its own says something is
    // slow; this says what to look at, and it is the difference between a
    // round trip and a fix. Objects and textures are what actually moved the
    // menu from 40fps — 69 objects and 67 textures down to 29 and 26.
    el.textContent = `${Math.round(fps)} fps · ${describe(game)}`;
    // Green above 50, amber 30-50, red below: the point is to be readable at a
    // glance while a child is using the app, not to be precise.
    el.dataset.level = fps >= 50 ? 'good' : fps >= 30 ? 'fair' : 'poor';
  };
  requestAnimationFrame(tick);
  return el;
}

/**
 * What the running scene is asking the renderer to do.
 *
 * Counted on the display list rather than read off the renderer, because
 * Phaser 4 publishes no draw-call figure — and the two numbers that actually
 * predict the cost here are how many things are drawn and how many distinct
 * textures they come from. A Graphics count is included separately: those
 * re-tessellate every frame whether or not they changed, and a screen quietly
 * accumulating them is the failure this readout exists to make visible.
 */
function describe(game) {
  const scene = game?.scene?.scenes?.find((s) => s.sys.settings.visible && s.sys.isActive());
  if (!scene) return '';
  let objects = 0;
  let graphics = 0;
  const textures = new Set();
  const walk = (list) => {
    for (const child of list) {
      if (child.type === 'Graphics') graphics++;
      if (child.list) {
        walk(child.list);
        continue;
      }
      objects++;
      if (child.texture) textures.add(child.texture.key);
    }
  };
  walk(scene.children.list);
  return `${objects} obj · ${textures.size} tex${graphics ? ` · ${graphics} gfx` : ''}`;
}
