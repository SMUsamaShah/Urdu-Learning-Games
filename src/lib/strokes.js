import manifest from '../../content/strokes.json';
import { glyphFont } from './content.js';
import { deviceStrokes } from './stroke-store.js';

/* The pen path for a letter: where each stroke starts, which way it goes, and what order they come in. */

const upem = manifest.upem ?? 2048;

/* The letters corrected on this device, loaded once. */
let device = { letters: {} };

/* Whether these paths were drawn against the font the app is shipping. */
let matchesFont = false;

export const strokesMatchFont = () => matchesFont;

/* Loads the device's corrections and settles which paths can be trusted. */
export async function initStrokes() {
  matchesFont = Boolean(manifest.font?.sha) && manifest.font?.sha === glyphFont()?.sha;
  device = await deviceStrokes();
  return Object.keys(device.letters).length;
}

/* Called by the editor when a letter is saved or cleared. */
export function noteDeviceStrokes(letterId, strokes) {
  if (strokes) device.letters[letterId] = { strokes, editedAt: Date.now() };
  else delete device.letters[letterId];
}

/* Where a letter's guide comes from: 'device', 'bundled', or 'none'. */
export function strokeSource(letterId) {
  if (!matchesFont) return 'none';
  if (device.letters?.[letterId]) return 'device';
  return manifest.letters?.[letterId]?.corrected ? 'bundled' : 'none';
}

/* The strokes to draw for a letter, in font units, or null. */
function entryFor(letterId) {
  const source = strokeSource(letterId);
  if (source === 'device') return device.letters[letterId].strokes;
  if (source === 'bundled') return manifest.letters[letterId].strokes;
  return null;
}

/* Whether a letter has a hand-corrected guide drawn for the current font. */
export function hasStrokes(letterId) {
  return strokeSource(letterId) !== 'none';
}

/* What the editor opens with: this device's corrections over what shipped. */
export function editableStrokes() {
  if (!matchesFont) return {};
  const out = {};
  for (const [id, entry] of Object.entries(manifest.letters ?? {})) {
    out[id] = { strokes: entry.strokes, corrected: Boolean(entry.corrected) };
  }
  for (const [id, entry] of Object.entries(device.letters ?? {})) {
    out[id] = { strokes: entry.strokes, corrected: true };
  }
  return out;
}

/* Every letter with a guide, for the verifiers and the settings count. */
export function guidedLetters() {
  const ids = new Set([
    ...Object.keys(manifest.letters ?? {}),
    ...Object.keys(device.letters ?? {}),
  ]);
  return [...ids].filter(hasStrokes);
}

/** A letter's strokes in display pixels.
 * @param {string} letterId
 * @param {object} placement
 * @param {number} placement.scale display pixels per font unit
 * @param {{x: number, y: number}} placement.origin where the glyph's bbox
 * @returns {{kind: string, points: {x: number, y: number}[], length: number}[]}
 */
export function strokesFor(letterId, { scale, origin, bbox }) {
  const entry = entryFor(letterId);
  if (!entry) return [];

  return entry.map((stroke) => {
    const points = stroke.points.map(([x, y]) => ({
      x: origin.x + (x - bbox[0]) * scale,
      y: origin.y + (y - bbox[1]) * scale,
    }));
    return { kind: stroke.kind, points, length: pathLength(points) };
  });
}

/* How wide the pen is, for a letter drawn at `scale`. */
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

/* The point `distance` along a polyline, and how far along the whole thing that is. */
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

/** How far along the path a point is, searching only *ahead* of `from`.
 * @returns {{distance: number, offPath: number}}
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
