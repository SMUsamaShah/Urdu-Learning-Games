/* A frame-rate readout, for telling a rendering problem from an input one. */

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

/* Attaches the readout. */
export function mountFpsMeter(game) {
  if (el) return el;
  el = document.createElement('div');
  el.className = 'fps-meter';
  el.hidden = !showFps();
  stageElement().appendChild(el);

  let last = 0;
  const tick = (now) => {
    requestAnimationFrame(tick);
    // Four times a second.
    if (now - last < 250) return;
    last = now;
    if (el.hidden) return;

    const fps = game?.loop?.actualFps ?? 0;
    // Include the time spent rendering the last frame.
    el.textContent = `${Math.round(fps)} fps · ${describe(game)}`;
    // Green above 50, amber from 30–50, and red below 30.
    el.dataset.level = fps >= 50 ? 'good' : fps >= 30 ? 'fair' : 'poor';
  };
  requestAnimationFrame(tick);
  return el;
}

/* What the running scene is asking the renderer to do. */
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
