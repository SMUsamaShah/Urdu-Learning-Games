import Phaser from 'phaser';
import { advanceAlong, nibWidth, pointAt, strokesFor } from './strokes.js';
import { hop } from './liveliness.js';
import * as sfx from './sfx.js';

/**
 * Following the pen: start here, go this way, then this stroke next.
 *
 * ## The ink is the path, not the finger
 *
 * The obvious build draws what the child actually drew. It is wrong, and it is
 * wrong in a way that shows up the moment a three-year-old touches it: their
 * line wobbles, so careful tracing and scribbling produce the same mess, and
 * the letter they end up looking at is not the letter. Every tracing app worth
 * copying snaps.
 *
 * So the finger does not draw. It *advances a cursor* along a path that was
 * already correct, and the ink is that path stroked up to the cursor. The
 * child's job is to stay near the line; the ink moving is the feedback, and
 * what they finish with is a properly written letter.
 *
 * ## Forwards only
 *
 * The cursor never goes backwards. A small hand wanders back over ground it has
 * covered constantly, and a nearest-point search over the whole path would drag
 * the ink back every time — punishing a wobble, which is the opposite of what
 * this screen is for. Off the path, nothing happens at all: no ink, no sparkles,
 * no telling-off. See `advanceAlong` in strokes.js.
 *
 * ## Dots are dabbed
 *
 * A dot is not a journey. Asking a child to trace one is asking them to do
 * something meaningless carefully, so a `dab` stroke is finished by touching
 * near it.
 */

/** How far from the start dot counts as starting, as a multiple of the nib. */
const START_NEAR = 1.9;
/** How far off the line the finger may stray before the ink stops. */
const OFF_PATH = 1.5;
/**
 * How far ahead of the cursor a finger may reach in one move.
 *
 * Generous, because a fast finger between two pointer events really does jump a
 * long way, and the alternative is the ink falling behind a child who is doing
 * it right. Not unlimited: without a bound, touching the far end of the stroke
 * would complete it.
 */
const LOOK_AHEAD = 6;
/** Close enough to the end. Nobody lands exactly on the last point. */
const FINISH = 0.97;

/**
 * @param {Phaser.Scene} scene
 * @param {object} config
 * @param {string} config.letterId
 * @param {number} config.scale display pixels per font unit
 * @param {{x: number, y: number}} config.origin where the glyph's bbox starts
 * @param {number[]} config.bbox the glyph's bbox, in font units
 * @param {string} config.colour the ink colour, as CSS
 * @param {() => void} config.onFinished every stroke done
 * @returns {object|null} null when the letter has no guide
 */
export function createGuide(scene, config) {
  const { letterId, scale, origin, bbox, colour, onFinished } = config;
  const strokes = strokesFor(letterId, { scale, origin, bbox });
  if (!strokes.length) return null;

  const nib = nibWidth(scale);
  const guide = {
    strokes,
    /** Which stroke is being written. */
    index: 0,
    /** How far along it, in display pixels. */
    cursor: 0,
    drawing: false,
    done: false,
  };

  // The ink, on its own canvas texture rather than a Graphics: it is added to
  // continuously and never rebuilt, which is exactly what a canvas is for and
  // exactly what a Graphics is worst at.
  const width = Math.ceil(bbox[2] * scale + nib * 2);
  const height = Math.ceil(bbox[3] * scale + nib * 2);
  const key = `guide-ink:${letterId}`;
  if (scene.textures.exists(key)) scene.textures.remove(key);
  const ink = scene.textures.createCanvas(key, Math.max(1, width), Math.max(1, height));
  const ctx = ink.context;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.strokeStyle = colour;
  ctx.fillStyle = colour;
  ctx.lineWidth = nib;

  const image = scene.add.image(origin.x - nib, origin.y - nib, key).setOrigin(0, 0);
  // Canvas coordinates are offset from screen coordinates by the padding left
  // for the nib, and by where the glyph sits. One place, so nothing else has to
  // remember it.
  const toCanvas = (point) => ({ x: point.x - origin.x + nib, y: point.y - origin.y + nib });

  /** The start dot and its arrow, redrawn whenever the stroke changes. */
  const marker = scene.add.container(0, 0);

  const current = () => guide.strokes[guide.index];

  function drawMarker() {
    marker.removeAll(true);
    if (guide.done) return;
    const stroke = current();
    const at = stroke.kind === 'dab' ? stroke.points[0] : pointAt(stroke.points, guide.cursor);

    const dot = scene.add.circle(at.x, at.y, nib * 0.62, 0x2fae74, 0.95);
    dot.setStrokeStyle(Math.max(2, nib * 0.16), 0xffffff, 0.9);
    marker.add(dot);
    // Pulsing, because a still green dot on a still letter is just a green dot.
    scene.tweens.add({
      targets: dot,
      scale: 1.35,
      duration: 620,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });

    if (stroke.kind === 'dab') return;
    // An arrow a little way along, which is the only thing on screen that says
    // which way this stroke goes.
    const ahead = pointAt(stroke.points, Math.min(stroke.length, guide.cursor + nib * 2.2));
    const angle = Phaser.Math.Angle.Between(at.x, at.y, ahead.x, ahead.y);
    const arrow = scene.add
      .triangle(ahead.x, ahead.y, 0, -nib * 0.42, nib * 0.8, 0, 0, nib * 0.42, 0x2fae74, 0.95)
      .setRotation(angle);
    marker.add(arrow);
  }

  /** Strokes the current path from `from` to `to`, in display pixels along it. */
  function paint(from, to) {
    const stroke = current();
    if (stroke.kind === 'dab') {
      const at = toCanvas(stroke.points[0]);
      ctx.beginPath();
      ctx.arc(at.x, at.y, nib * 0.52, 0, Math.PI * 2);
      ctx.fill();
      ink.refresh();
      return;
    }

    // Walked in short steps rather than segment by segment, so the ink ends
    // exactly where the cursor is instead of at the next corner.
    const step = Math.max(1.5, nib * 0.25);
    ctx.beginPath();
    let first = true;
    for (let d = from; d < to + step; d += step) {
      const at = toCanvas(pointAt(stroke.points, Math.min(d, to)));
      if (first) {
        ctx.moveTo(at.x, at.y);
        first = false;
      } else ctx.lineTo(at.x, at.y);
    }
    ctx.stroke();
    ink.refresh();
  }

  function finishStroke() {
    const stroke = current();
    if (stroke.kind === 'drag') paint(guide.cursor, stroke.length);
    else paint(0, 0);
    guide.cursor = 0;
    guide.drawing = false;
    guide.index++;

    if (guide.index >= guide.strokes.length) {
      guide.done = true;
      marker.removeAll(true);
      onFinished?.();
      return;
    }
    sfx.pop();
    drawMarker();
    hop(scene, marker, { height: nib * 0.5 });
  }

  // The start dot has to be there before the first touch, or the screen opens
  // saying "follow the line" with nothing to say where the line begins.
  drawMarker();

  // Reading state through getters rather than handing `guide` out: the caller
  // must never be able to move the cursor without the ink following it.
  return {
    strokes,
    /** 0 to 1 across the whole letter, counting the stroke in progress. */
    get progress() {
      if (guide.done) return 1;
      const per = 1 / guide.strokes.length;
      const stroke = current();
      const within = stroke.kind === 'dab' ? 0 : guide.cursor / (stroke.length || 1);
      return Math.min(1, guide.index * per + within * per);
    },
    get done() {
      return guide.done;
    },
    get index() {
      return guide.index;
    },
    get cursor() {
      return guide.cursor;
    },
    /** Where the child should be touching now, for the hint and the verifier. */
    get target() {
      if (guide.done) return null;
      const stroke = current();
      return stroke.kind === 'dab' ? stroke.points[0] : pointAt(stroke.points, guide.cursor);
    },

    /**
     * A finger has landed.
     *
     * @returns {boolean} whether it landed somewhere that starts the stroke
     */
    begin(x, y) {
      if (guide.done) return false;
      const stroke = current();
      const at = this.target;
      if (Phaser.Math.Distance.Between(x, y, at.x, at.y) > nib * START_NEAR) return false;

      if (stroke.kind === 'dab') {
        finishStroke();
        return true;
      }
      guide.drawing = true;
      return true;
    },

    /**
     * The finger has moved.
     *
     * @returns {boolean} whether the ink advanced, which is what the sparkle
     *   trail follows — the clearest signal a child gets about whether they are
     *   on the line, and it works for one who cannot read a progress bar.
     */
    move(x, y) {
      if (!guide.drawing || guide.done) return false;
      const stroke = current();
      const { distance, offPath } = advanceAlong(
        stroke.points,
        guide.cursor,
        x,
        y,
        nib * LOOK_AHEAD
      );
      if (offPath > nib * OFF_PATH || distance <= guide.cursor) return false;

      paint(guide.cursor, distance);
      guide.cursor = distance;
      drawMarker();

      if (guide.cursor >= stroke.length * FINISH) finishStroke();
      return true;
    },

    /** Lifted. The ink stays where it got to; nothing is taken away. */
    lift() {
      guide.drawing = false;
    },

    /** Everything drawn so far, gone. */
    reset() {
      ctx.clearRect(0, 0, ink.width, ink.height);
      ink.refresh();
      guide.index = 0;
      guide.cursor = 0;
      guide.drawing = false;
      guide.done = false;
      drawMarker();
    },

    /** Fills the letter in, for the moment it is finished. */
    complete() {
      guide.done = true;
      marker.removeAll(true);
    },

    destroy() {
      marker.destroy(true);
      image.destroy();
      if (scene.textures.exists(key)) scene.textures.remove(key);
    },
  };
}
