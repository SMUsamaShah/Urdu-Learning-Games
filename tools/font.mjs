import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/**
 * The typeface, and the only place in the repo that names one.
 *
 * Nothing under src/ loads a font: every Urdu shape in the game comes out of
 * content/glyphs.json, and all the sizing derives from the `upem` and the
 * per-glyph bounding boxes recorded in there. So changing the typeface is
 * changing this path and running `npm run bake` — the whole app follows,
 * tracing included, because the tracing paths are these same outlines.
 *
 * AlQalam Taj Nastaleeq, chosen over Noto Nastaliq for its heavier, rounder
 * pen: Noto is a text face and thins out at the sizes a three-year-old reads
 * at, where this holds its stroke. Both shape every one of the 272 runs the
 * bake asks for with a real outline. This one is 2048 units per em against
 * Noto's 1000, which changes nothing downstream — every fitter in glyph.js
 * works in ems and reads `upem` out of the file rather than assuming one.
 *
 * Its own module rather than a constant inside bake-glyphs.mjs because the
 * seeder needs the fingerprint too, and bake-glyphs runs its whole bake on
 * import.
 */
export const FONT_WOFF2 = path.join(
  ROOT,
  'node_modules/alqalam-taj-nastaliq/fonts/alqalam-taj-nastaliq.woff2'
);

/**
 * Which font a set of outlines came from, recorded alongside them.
 *
 * Everything derived from a glyph belongs to the font that drew it, and the
 * tracing paths are the sharp case: a path is a centreline through one
 * typeface's outlines, and against another it sits beside the letter rather
 * than on it. Switching from Noto to AlQalam Taj invalidated every trace in the
 * app, and nothing in the repo would have said so.
 *
 * Hashed rather than named, because a package updating in place changes the
 * outlines without changing the filename, and that is exactly the case a name
 * would miss. Twelve hex characters is far more than enough to tell two fonts
 * apart; this is a mismatch check, not a security one.
 */
export function fontFingerprint() {
  const bytes = fs.readFileSync(FONT_WOFF2);
  return {
    file: path.basename(FONT_WOFF2),
    sha: crypto.createHash('sha256').update(bytes).digest('hex').slice(0, 12),
  };
}
