import glyphs from '../../content/glyphs.json';
import manifest from '../../content/strokes.json';

/**
 * The pen path for a letter: where each stroke starts, which way it goes, and
 * what order they come in.
 *
 * Seeded by tools/seed-strokes.mjs and corrected in tools/trace-studio. The
 * manifest is imported rather than fetched, like backdrops.js, images.js and
 * tiles.js, so the Write screen can decide in `create()` whether a letter has a
 * guide before it draws anything.
 *
 * ## Only where a letter has been corrected
 *
 * `hasStrokes` is false for a letter still carrying the seeder's guess, and
 * that is deliberate rather than cautious. A guide is an instruction — *this is
 * how the letter is written* — and a wrong one teaches a child to write it
 * wrongly, which is worse than not teaching them at all. The colouring game is
 * a perfectly good thing to fall back to.
 *
 * It also means this ships letter by letter: correct five in the studio and
 * those five are guided, with no half-built state on screen.
 */

const upem = manifest.upem ?? 2048;

/**
 * Whether these paths were drawn against the font the app is shipping.
 *
 * A stroke is a centreline through one typeface's outlines. Against a different
 * face it sits beside the letter rather than on it, and a guide that sits beside
 * the letter teaches a child to write it wrongly — worse than not teaching them
 * at all. So a mismatch turns *every* guide off and the Write screen falls back
 * to colouring in, which needs no authoring and cannot be stale.
 *
 * The fingerprint is written by tools/font.mjs into both files. Swapping the
 * font and re-baking changes glyphs.json and not strokes.json, so this goes
 * false the moment it should — and `npm test` fails on it before anyone plays.
 */
export const strokesMatchFont = manifest.font?.sha === glyphs.font?.sha;

/** Whether a letter has a hand-corrected guide drawn for the current font. */
export function hasStrokes(letterId) {
  if (!strokesMatchFont) return false;
  return Boolean(manifest.letters?.[letterId]?.corrected);
}

/** Every letter with a guide, for the verifiers and the settings count. */
export function guidedLetters() {
  return Object.keys(manifest.letters ?? {}).filter(hasStrokes);
}

/**
 * A letter's strokes in display pixels.
 *
 * The stored points are in font units — the same space as the outline in
 * glyphs.json — so this is the one place that maps them, using the same scale
 * and origin the caller used to draw the glyph. Passing anything else in is how
 * a guide ends up next to its letter rather than on it.
 *
 * @param {string} letterId
 * @param {object} placement
 * @param {number} placement.scale display pixels per font unit
 * @param {{x: number, y: number}} placement.origin where the glyph's bbox
 *   top-left sits on screen
 * @returns {{kind: string, points: {x: number, y: number}[], length: number}[]}
 */
export function strokesFor(letterId, { scale, origin, bbox }) {
  const entry = manifest.letters?.[letterId];
  if (!entry?.corrected || !strokesMatchFont) return [];

  return entry.strokes.map((stroke) => {
    const points = stroke.points.map(([x, y]) => ({
      x: origin.x + (x - bbox[0]) * scale,
      y: origin.y + (y - bbox[1]) * scale,
    }));
    return { kind: stroke.kind, points, length: pathLength(points) };
  });
}

/** How wide the pen is, for a letter drawn at `scale`. */
export function nibWidth(scale) {
  return upem * 0.075 * scale;
}

export function pathLength(points) {
  let total = 0;
  for (let i = 1; i < points.length; i++) {
    total += Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y);
  }
  return total;
}

/**
 * The point `distance` along a polyline, and how far along the whole thing that
 * is. Used to draw the ink up to wherever the finger has reached.
 */
export function pointAt(points, distance) {
  let travelled = 0;
  for (let i = 1; i < points.length; i++) {
    const step = Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y);
    if (travelled + step >= distance) {
      const t = step ? (distance - travelled) / step : 0;
      return {
        x: points[i - 1].x + (points[i].x - points[i - 1].x) * t,
        y: points[i - 1].y + (points[i].y - points[i - 1].y) * t,
        index: i,
      };
    }
    travelled += step;
  }
  return { ...points[points.length - 1], index: points.length - 1 };
}

/**
 * How far along the path a point is, searching only *ahead* of `from`.
 *
 * Forward-only on purpose. A three-year-old's finger wanders back over ground
 * it has covered, and a nearest-point search over the whole path would snap the
 * cursor backwards every time — the ink would stutter and the child would be
 * punished for a wobble. Going forward only means the worst a wobble does is
 * nothing at all.
 *
 * @returns {{distance: number, offPath: number}} how far along, and how far the
 *   point actually was from the path there
 */
export function advanceAlong(points, from, x, y, lookAhead) {
  let travelled = 0;
  let best = { distance: from, offPath: Infinity };

  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1];
    const b = points[i];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const step = Math.hypot(dx, dy);
    const segmentEnd = travelled + step;

    if (segmentEnd >= from && travelled <= from + lookAhead && step > 0) {
      const t = Math.max(0, Math.min(1, ((x - a.x) * dx + (y - a.y) * dy) / (step * step)));
      const at = travelled + t * step;
      if (at >= from && at <= from + lookAhead) {
        const offPath = Math.hypot(x - (a.x + dx * t), y - (a.y + dy * t));
        if (offPath < best.offPath) best = { distance: at, offPath };
      }
    }
    travelled = segmentEnd;
  }
  return best;
}
