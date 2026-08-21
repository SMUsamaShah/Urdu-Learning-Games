/**
 * Turning the app sideways when the phone will not.
 *
 * The app is landscape, always, the way a video game is: opening it shows a
 * landscape picture and the *phone* is what turns. `orientation.js` asks the OS
 * for that, and where the ask is granted there is nothing for this file to do —
 * the OS turns the whole page and both ways round work by themselves.
 *
 * The ask is refused in a browser tab that is not fullscreen, and on a phone
 * with rotation switched off in system settings. That second one is common on a
 * device handed to a small child. This is what happens then: the app draws
 * itself sideways across the screen, filling it, and somebody turns the phone to
 * read it.
 *
 * ## The stage, not the canvas
 *
 * `#stage` wraps the canvas *and* the HTML screens — Settings, the parental
 * gate, the frame counter — and the rotation goes on the wrapper. A CSS
 * transform makes an element the containing block for its `position: fixed`
 * descendants, so everything inside comes along, and the browser hit-tests a
 * transformed DOM correctly with no help from us.
 *
 * ## What the browser then lies about, twice
 *
 * `getBoundingClientRect()` on anything inside a rotated element reports the
 * box **as it appears on screen**, which is the rotated one. Phaser asks that
 * question in two places and gets a misleading answer both times:
 *
 *  - `ScaleManager.getParentBounds` uses it to decide how big to draw, and
 *    would size a landscape canvas to a portrait box.
 *  - `InputManager.transformPointer` (`game.input`, not `game.input.manager`)
 *    uses it, through `canvasBounds` and
 *    `displayScale`, to turn a tap into a game coordinate — and a 90-degree
 *    turn swaps the axes, which `transformX` and `transformY` cannot express
 *    between them because each is handed one number.
 *
 * Both are patched here, and it is one idea rather than two hacks: the DOM
 * reports the rotated box, and this module is the thing that knows the
 * unrotated one, because it is the thing that rotated it.
 *
 * Without the second patch the app looks perfect in a screenshot and every tap
 * lands somewhere else. There is a check for exactly that in verify-games.
 */

import { DESIGN } from './theme.js';

/** How far the app is turned, clockwise. 0 means the phone is doing the work. */
let turn = 0;

/** The stage's size before rotation: what the app thinks it is drawing on. */
const box = { width: 0, height: 0 };

/** @type {HTMLElement|null} */
let stage = null;
/** @type {Phaser.Game|null} */
let game = null;

/**
 * Which way to turn when the phone is upright and we have no better idea.
 *
 * Rotating 90 degrees clockwise puts the top of the picture along the phone's
 * right-hand edge, so the phone is turned anticlockwise to read it. Either
 * choice is arbitrary on its own; this one is only the default for when the
 * tilt sensor says nothing.
 */
const DEFAULT_TURN = 90;

/**
 * How far past flat the phone must be tilted before the sensor is believed.
 *
 * A phone lying on a table reads near zero on both axes and its gamma flickers
 * across the sign with every knock of the table. Without a dead zone the app
 * would flip end over end while a child leant on it.
 */
const TILT_DEAD_ZONE = 20;

/** The last angle the sensor asked for, kept while the phone lies flat. */
let tilted = DEFAULT_TURN;

/** The viewport, as CSS pixels. */
function viewport() {
  const view = window.visualViewport;
  return {
    width: Math.round(view?.width ?? window.innerWidth) || 1,
    height: Math.round(view?.height ?? window.innerHeight) || 1,
  };
}

/**
 * Where a page point lands in game coordinates, un-rotating on the way.
 *
 * The canvas is centred in the stage by Phaser's `CENTER_BOTH`, so its inset is
 * worked out from the two sizes rather than read back off the element: an
 * `offsetLeft` would have to be trusted to be relative to the stage, and this
 * does not have to trust anything.
 */
function toGame(pageX, pageY) {
  const rect = stage.getBoundingClientRect();
  const sx = pageX - rect.left;
  const sy = pageY - rect.top;

  // Into the stage's own unrotated frame. `rect` is the on-screen box, so its
  // width is the stage's unrotated *height* and the other way about.
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

/** Puts Phaser's two DOM questions back on the unrotated box. */
function patchPhaser() {
  const scale = game.scale;
  // `game.input` *is* the InputManager. A scene's `scene.input` is the plugin
  // and carries a `.manager` back to this one, which is the shape it is easy to
  // reach for by mistake — and `game.input.manager` is undefined, which shows
  // up as a TypeError on the app's first frame rather than as a wrong tap.
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

    // Phaser's own smoothing, kept, because a dragged finger on this screen is
    // half the app now and losing the smoothing would make every drag jitter.
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

/**
 * Decides the angle and applies it.
 *
 * A landscape window means the phone is already doing the turning — either it
 * was held that way or the OS lock was granted — and the stage goes back to
 * lying flat over the viewport.
 */
function apply() {
  const view = viewport();
  const wanted = view.width >= view.height ? 0 : tilted;

  turn = wanted;
  box.width = turn ? view.height : view.width;
  box.height = turn ? view.width : view.height;

  // Sized in pixels rather than in `vh`/`vw`: on a phone those units mean the
  // viewport with the URL bar hidden, whether or not it currently is, and the
  // app would hang off the bottom of the screen by the height of the bar.
  stage.style.width = `${box.width}px`;
  stage.style.height = `${box.height}px`;
  stage.dataset.turn = String(turn);

  game?.scale?.refresh();
}

/**
 * Which way up the phone is, from the tilt sensor.
 *
 * The only signal there is in the case this module exists for. When rotation is
 * switched off the browser never reports that the phone was turned — the
 * viewport stays portrait and no resize fires — so without this the app would
 * be upside down half the time and there would be nothing to notice it.
 *
 * Android fires `deviceorientation` without asking permission.
 *
 * **The sign wants checking on a real phone.** `gamma` is the left-to-right
 * tilt and is positive tilting right, so tilting right should be the turn that
 * brings the picture upright — that is read off the spec rather than measured,
 * and if it comes out backwards this is the one line to flip.
 */
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

/**
 * Starts turning. Called once, after the game exists.
 *
 * @param {Phaser.Game} phaserGame
 */
export function watchTurn(phaserGame) {
  if (typeof window === 'undefined') return;
  stage = document.getElementById('stage');
  if (!stage) return;
  game = phaserGame;

  // The stage first, and without waiting for anything: it is plain DOM, and
  // the app should never be seen upright for a frame before turning over.
  apply();
  watchTilt();
  window.addEventListener('resize', apply);
  window.addEventListener('orientationchange', apply);
  window.visualViewport?.addEventListener('resize', apply);

  // The patches after Phaser has booted. `new Phaser.Game()` returns before
  // that has happened — there is no scale manager and no input manager yet, and
  // reaching for either here is a TypeError on the first line of the app.
  const patch = () => {
    patchPhaser();
    apply();
  };
  if (game.scale && game.input) patch();
  else game.events.once('ready', patch);
}

/** How far the app is turned. Exposed for the checks. */
export const turnedBy = () => turn;

/**
 * Where an overlay must be mounted to be turned along with the app.
 *
 * Settings, the parental gate, the frame counter and the update badge all hang
 * themselves off something. If that something is `body` they stay upright while
 * the app lies on its side, which on a phone that will not turn means Settings
 * is unreadable on exactly the screens a grown-up opens it from.
 *
 * Falls back to `body` so nothing depends on the stage existing — the recording
 * studio and the trace editor are served as their own pages.
 */
export function stageElement() {
  return document.getElementById('stage') ?? document.body;
}
