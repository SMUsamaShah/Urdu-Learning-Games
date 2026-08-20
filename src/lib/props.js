/**
 * The furniture of a game screen, drawn rather than approximated.
 *
 * A game called "sort the letters into baskets" was showing two rounded
 * rectangles, on a backdrop that has real baskets painted into it — so the
 * scenery was better drawn than the thing being played with. A game called
 * "caterpillar" was a row of white circles with no caterpillar anywhere. In
 * both cases the picture was saying nothing, and the reference apps this is
 * chasing do the opposite: one big painted prop, filling the frame, that *is*
 * the game.
 *
 * These use the same kit as the menu tiles (src/lib/draw-kit.js), at play-area
 * size. One pen, one palette, so a basket on a screen and a basket on a tile
 * are recognisably the same basket.
 *
 * ## Baked, not drawn every frame
 *
 * Each of these returns a texture key. A Phaser Graphics re-tessellates on the
 * CPU every single frame for a picture that never changes — see the note above
 * `shapeTextures` in theme.js, and the meadow in scenery.js, which are here for
 * the same reason. A prop is decided when a round is dealt and never moves.
 */

import { INK, PAPER, WOOD, mix, pen } from './draw-kit.js';

/**
 * Rasterised at this multiple and scaled back down.
 *
 * Props have long curved edges — a basket's rim, a caterpillar's back — and
 * those alias badly at 1x on a phone. Every caller must remember the matching
 * `setScale(1 / SUPERSAMPLE)`; forgetting it is the standard bug here, so the
 * helpers below hand back a ready-made image rather than a key where they can.
 */
export const SUPERSAMPLE = 2;

/**
 * A canvas texture with the origin at its centre, and the drawing kit on it.
 *
 * @returns {string} the texture key
 */
function baked(scene, key, width, height, draw) {
  if (scene.textures.exists(key)) return key;
  const canvas = document.createElement('canvas');
  canvas.width = Math.ceil(width * SUPERSAMPLE);
  canvas.height = Math.ceil(height * SUPERSAMPLE);
  const ctx = canvas.getContext('2d');
  ctx.scale(SUPERSAMPLE, SUPERSAMPLE);
  ctx.translate(width / 2, height / 2);
  draw(ctx);
  const texture = scene.textures.createCanvas(key, canvas.width, canvas.height);
  texture.context.drawImage(canvas, 0, 0);
  texture.refresh();
  return key;
}

/**
 * A baked prop as an image, already scaled back down.
 *
 * Named, so a check can find every prop on a screen without knowing what any of
 * them are. The failure this exists for is silent: a texture sized too small
 * for what is drawn into it crops the drawing, and the first caterpillar came
 * out with the side of its head missing. Nothing throws, and it is only visible
 * on the one screen somebody happens to open. See verify-games.mjs.
 */
function propImage(scene, key, width, height, draw) {
  return scene.add
    .image(0, 0, baked(scene, key, width, height, draw))
    .setScale(1 / SUPERSAMPLE)
    .setName('prop');
}

// ------------------------------------------------------------------ baskets

/**
 * A woven basket, open at the top, with a front the letter goes on.
 *
 * Wider at the rim than at the base, because that is what makes a shape read as
 * a basket rather than as a bucket, and the weave runs in both directions —
 * verticals behind, horizontals over — because a single set of lines reads as
 * corrugated iron.
 *
 * The colour is the game's, not a wicker brown: the two baskets have to be told
 * apart at a glance from across a room, and two brown baskets are one wide
 * brown thing. So the wicker is the game's colour with the warmth of wood mixed
 * through it, which keeps them distinct and still lets them look woven.
 *
 * @param {Phaser.Scene} scene
 * @param {{width: number, height: number, color: number}} spec
 * @returns {Phaser.GameObjects.Image} centred on (0, 0)
 */
export function basket(scene, { width, height, color }) {
  const key = `prop:basket:${Math.round(width)}x${Math.round(height)}:${color}`;
  // Room above the rim for the handles, and below for the shadow.
  const box = { width: width * 1.16, height: height * 1.34 };

  return propImage(scene, key, box.width, box.height, (ctx) => {
    const d = pen(ctx, box.width, box.height, color);
    const p = d.p;
    const wicker = mix(p.base, WOOD, 0.34);
    const shade = mix(wicker, '#101423', 0.26);
    const light = mix(wicker, PAPER, 0.3);

    const top = -height / 2;
    const bottom = height / 2;
    const half = width / 2;
    const foot = width * 0.41;

    // Sitting on something, so it is not floating.
    d.ellipse(0, bottom + 6, foot * 1.05, height * 0.07, { fill: 'rgba(43,48,71,0.16)' });

    // Two handles, drawn before the body so they come out from behind it.
    for (const side of [-1, 1]) {
      d.ctx.save();
      d.ctx.beginPath();
      d.ctx.ellipse(side * half * 0.98, top + height * 0.22, width * 0.1, height * 0.19, 0, 0, Math.PI * 2);
      d.ctx.strokeStyle = shade;
      d.ctx.lineWidth = 11;
      d.ctx.stroke();
      d.ctx.restore();
    }

    const body = [
      [-half, top],
      [half, top],
      [foot, bottom],
      [-foot, bottom],
    ];
    d.poly(body, { fill: wicker });

    // The weave, clipped to the body so it stops at the edges.
    d.inside(
      (c) => {
        c.beginPath();
        body.forEach(([x, y], i) => (i ? c.lineTo(x, y) : c.moveTo(x, y)));
        c.closePath();
      },
      () => {
        for (let i = 1; i < 7; i++) {
          const x = -half + (width / 7) * i;
          d.line(x, top, x * 0.82, bottom, { stroke: shade, lw: 3.5 });
        }
        for (let i = 1; i < 5; i++) {
          const y = top + (height / 5) * i;
          d.line(-half, y, half, y, { stroke: light, lw: 6 });
          d.line(-half, y + 4, half, y + 4, { stroke: shade, lw: 2 });
        }
      }
    );

    // The rim, and the dark mouth under it, so the basket is open.
    d.ellipse(0, top, half, height * 0.11, { fill: mix(wicker, '#101423', 0.45) });
    d.ctx.save();
    d.ctx.beginPath();
    d.ctx.ellipse(0, top, half, height * 0.11, 0, 0, Math.PI * 2);
    d.ctx.strokeStyle = light;
    d.ctx.lineWidth = 12;
    d.ctx.stroke();
    d.ctx.strokeStyle = shade;
    d.ctx.lineWidth = 3;
    d.ctx.stroke();
    d.ctx.restore();

    // A plain panel across the front. The letter goes here, and a letter drawn
    // straight onto the weave is a letter nobody can read.
    d.rrect(0, height * 0.09, width * 0.62, height * 0.4, height * 0.09, {
      fill: p.base,
      stroke: shade,
      lw: 4,
    });
  });
}

// -------------------------------------------------------------- caterpillar

/** Two greens, alternating along the body. */
const BODY_GREENS = ['#6aab3f', '#7cbf4a'];

/**
 * The caterpillar the segments sit on.
 *
 * The segments themselves stay exactly what they were — white discs with a
 * letter on, or an empty socket — because they are the game and they have to
 * stay legible. What was missing was everything around them: the creature they
 * are the back of.
 *
 * So this draws underneath: a green body swelling around each segment, joined
 * between them, on legs, with a head at the leading end. It is one baked image
 * behind the whole row rather than a piece per segment, because the shape is
 * continuous — a chain of separate circles is what the screen already had.
 *
 * @param {Phaser.Scene} scene
 * @param {{x: number, y: number}[]} places segment centres, in reading order —
 *   right to left, since the alphabet starts at the right-hand end
 * @param {number} radius of a segment
 * @returns {Phaser.GameObjects.Image} positioned in world coordinates
 */
export function caterpillar(scene, places, radius) {
  if (!places.length) return null;

  // Rows, because a long run wraps. Each is its own creature: one body that
  // teleported from the end of one line to the start of the next would be a
  // stranger thing to look at than two caterpillars.
  const rows = new Map();
  for (const place of places) {
    if (!rows.has(place.y)) rows.set(place.y, []);
    rows.get(place.y).push(place);
  }

  const swell = radius * 1.26;
  const headSize = radius * 1.34;
  // Room for everything that sticks out past a segment, worked out from where
  // the head is actually put rather than guessed: the face sits two radii in
  // front of the leading segment and is 1.34 radii across, and the antennae
  // reach another 2.3 above it. Getting this wrong does not throw — the texture
  // is simply too small and the drawing is cropped, which on the first attempt
  // took the side of the caterpillar's head off.
  const left = Math.min(...places.map((p) => p.x)) - swell - radius * 0.9;
  const right = Math.max(...places.map((p) => p.x)) + radius * 3.8;
  const top = Math.min(...places.map((p) => p.y)) - radius * 2.9;
  const bottom = Math.max(...places.map((p) => p.y)) + swell + radius * 0.8;
  const width = right - left;
  const height = bottom - top;
  const centreX = (left + right) / 2;
  const centreY = (top + bottom) / 2;

  const key = `prop:caterpillar:${places.map((p) => `${Math.round(p.x)}.${Math.round(p.y)}`).join('_')}:${Math.round(radius)}`;

  const image = propImage(scene, key, width, height, (ctx) => {
    const d = pen(ctx, width, height, 0x6aab3f);
    const at = (place) => ({ x: place.x - centreX, y: place.y - centreY });

    for (const row of rows.values()) {
      // Right to left is the order they were dealt in; the head leads.
      const sorted = [...row].sort((a, b) => b.x - a.x);
      const head = at(sorted[0]);

      // Legs first, so the body covers where they join it.
      for (const [i, place] of sorted.entries()) {
        const seat = at(place);
        for (const side of [-0.45, 0.45]) {
          d.line(
            seat.x + radius * side * 0.7,
            seat.y + swell * 0.55,
            seat.x + radius * side * 1.1,
            seat.y + swell + radius * 0.55,
            { stroke: mix(BODY_GREENS[i % 2], '#101423', 0.35), lw: 8 }
          );
        }
      }

      // The body: a swelling at each segment, joined by the gaps between.
      for (let i = sorted.length - 1; i >= 0; i--) {
        const seat = at(sorted[i]);
        const tone = BODY_GREENS[i % 2];
        if (i > 0) {
          const next = at(sorted[i - 1]);
          d.rrect(
            (seat.x + next.x) / 2,
            (seat.y + next.y) / 2,
            Math.abs(next.x - seat.x) + 4,
            swell * 1.5,
            swell * 0.7,
            { fill: mix(tone, '#101423', 0.1) }
          );
        }
        d.circle(seat.x, seat.y, swell, { fill: tone });
        // A highlight along the top, so the back is round rather than flat.
        d.ctx.save();
        d.ctx.beginPath();
        d.ctx.arc(seat.x, seat.y, swell * 0.78, Math.PI * 1.15, Math.PI * 1.65);
        d.ctx.strokeStyle = mix(tone, PAPER, 0.4);
        d.ctx.lineWidth = 7;
        d.ctx.lineCap = 'round';
        d.ctx.stroke();
        d.ctx.restore();
      }

      // And the head, out in front of the first segment.
      const face = { x: head.x + swell + headSize * 0.55, y: head.y - radius * 0.06 };
      for (const side of [-0.5, 0.35]) {
        d.line(
          face.x + headSize * 0.2,
          face.y - headSize * 0.7,
          face.x + headSize * (0.55 + side * 0.3),
          face.y - headSize * 1.5,
          { stroke: '#4d7d2c', lw: 7 }
        );
        d.circle(
          face.x + headSize * (0.55 + side * 0.3),
          face.y - headSize * 1.55,
          headSize * 0.15,
          { fill: '#f7c948' }
        );
      }
      d.circle(face.x, face.y, headSize, { fill: '#5f9e3a' });
      d.circle(face.x + headSize * 0.34, face.y - headSize * 0.22, headSize * 0.28, { fill: PAPER });
      d.circle(face.x - headSize * 0.16, face.y - headSize * 0.3, headSize * 0.24, { fill: PAPER });
      d.circle(face.x + headSize * 0.4, face.y - headSize * 0.2, headSize * 0.14, { fill: INK });
      d.circle(face.x - headSize * 0.12, face.y - headSize * 0.28, headSize * 0.12, { fill: INK });
      d.arc(face.x + headSize * 0.12, face.y + headSize * 0.2, headSize * 0.42, 0.25, Math.PI - 0.55, {
        stroke: '#3f6b26',
        lw: 6,
      });
      // Cheeks, which is the whole difference between a face and two dots.
      d.ellipse(face.x + headSize * 0.72, face.y + headSize * 0.24, headSize * 0.2, headSize * 0.13, {
        fill: 'rgba(233,138,31,0.45)',
      });
      d.ellipse(face.x - headSize * 0.5, face.y + headSize * 0.22, headSize * 0.18, headSize * 0.12, {
        fill: 'rgba(233,138,31,0.45)',
      });
    }
  });

  return image.setPosition(centreX, centreY);
}
