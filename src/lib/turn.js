/* Turning the app sideways when the phone will not. */

import { DESIGN } from './theme.js';

/* How far the app is turned, clockwise. */
let turn = 0;

/* The stage's size before rotation: what the app thinks it is drawing on. */
const box = { width: 0, height: 0 };

/** @type {HTMLElement|null} */
let stage = null;
/** @type {Phaser.Game|null} */
let game = null;

/* Which way to turn when the phone is upright and we have no better idea. */
const DEFAULT_TURN = 90;

/* How far past flat the phone must be tilted before the sensor is believed. */
const TILT_DEAD_ZONE = 20;

/* The last angle the sensor asked for, kept while the phone lies flat. */
let tilted = DEFAULT_TURN;

/* The viewport, as CSS pixels. */
function viewport() {
  const view = window.visualViewport;
  return {
    width: Math.round(view?.width ?? window.innerWidth) || 1,
    height: Math.round(view?.height ?? window.innerHeight) || 1,
  };
}

/* Where a page point lands in game coordinates, un-rotating on the way. */
function toGame(pageX, pageY) {
  const rect = stage.getBoundingClientRect();
  const sx = pageX - rect.left;
  const sy = pageY - rect.top;

  // Into the stage's own unrotated frame.
  const local =
    turn === 90 ? { x: sy, y: rect.width - sx } : { x: rect.height - sy, y: sx };

  const canvas = game.canvas;
  const inset = {
    x: (box.width - canvas.offsetWidth) / 2,
    y: (box.height - canvas.offsetHeight) / 2,
  };
  return {
    x: ((local.x - inset.x) * DESIGN.width) / canvas.offsetWidth,
    y: ((local.y - inset.y) * DESIGN.height) / canvas.offsetHeight,
  };
}

/* Puts Phaser's two DOM questions back on the unrotated box. */
function patchPhaser() {
  const scale = game.scale;
  // `game.input` *is* the InputManager.
  const input = game.input;
  const parentBounds = scale.getParentBounds.bind(scale);
  const transform = input.transformPointer.bind(input);

  scale.getParentBounds = function () {
    if (!turn) return parentBounds();
    const changed = this.parentSize.width !== box.width || this.parentSize.height !== box.height;
    this.parentSize.setSize(box.width, box.height);
    return changed;
  };

  input.transformPointer = function (pointer, pageX, pageY, wasMove) {
    if (!turn) return transform(pointer, pageX, pageY, wasMove);

    // Phaser's own smoothing.
    const p0 = pointer.position;
    const p1 = pointer.prevPosition;
    p1.x = p0.x;
    p1.y = p0.y;

    const at = toGame(pageX, pageY);
    const a = pointer.smoothFactor;
    if (!wasMove || a === 0) {
      p0.x = at.x;
      p0.y = at.y;
    } else {
      p0.x = at.x * a + p1.x * (1 - a);
      p0.y = at.y * a + p1.y * (1 - a);
    }
  };
}

/* Decides the angle and applies it. */
function apply() {
  const view = viewport();
  const wanted = view.width >= view.height ? 0 : tilted;

  turn = wanted;
  box.width = turn ? view.height : view.width;
  box.height = turn ? view.width : view.height;

  // Sized in pixels rather than in `vh`/`vw`.
  stage.style.width = `${box.width}px`;
  stage.style.height = `${box.height}px`;
  stage.dataset.turn = String(turn);

  game?.scale?.refresh();
}

/* Which way up the phone is, from the tilt sensor. */
function watchTilt() {
  window.addEventListener(
    'deviceorientation',
    (event) => {
      const gamma = event.gamma;
      if (typeof gamma !== 'number' || Math.abs(gamma) < TILT_DEAD_ZONE) return;
      const wanted = gamma > 0 ? 90 : 270;
      if (wanted === tilted) return;
      tilted = wanted;
      if (turn) apply();
    },
    { passive: true }
  );
}

/** Starts turning.
 * @param {Phaser.Game} phaserGame
 */
export function watchTurn(phaserGame) {
  if (typeof window === 'undefined') return;
  stage = document.getElementById('stage');
  if (!stage) return;
  game = phaserGame;

  // Apply the DOM rotation before Phaser starts.
  apply();
  watchTilt();
  window.addEventListener('resize', apply);
  window.addEventListener('orientationchange', apply);
  window.visualViewport?.addEventListener('resize', apply);

  // The patches after Phaser has booted.
  const patch = () => {
    patchPhaser();
    apply();
  };
  if (game.scale && game.input) patch();
  else game.events.once('ready', patch);
}

/* How far the app is turned. */
export const turnedBy = () => turn;

/* Where an overlay must be mounted to be turned along with the app. */
export function stageElement() {
  return document.getElementById('stage') ?? document.body;
}
