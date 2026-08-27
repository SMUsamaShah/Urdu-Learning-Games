/** Draws baked Urdu glyphs.
 * @typedef {object} Glyph
 * @property {string} d SVG path data, y-down, in font units.
 * @property {number[]} bbox [x, y, width, height] of the inked area.
 * @property {number} advance Advance width of the run.
 */

import { glyphUpem } from './content.js';

/* Supersample factor for rasterised glyphs. */
const SUPERSAMPLE = 3;

/* Below this em size, an outline is dropped entirely rather than drawn thin. */
const MIN_OUTLINE_EM = 50;

/** Builds (or returns a cached) Phaser texture containing one glyph.
 * @param {Phaser.Scene} scene
 * @param {string} key Cache key. Must be unique per glyph+size+colour.
 * @param {Glyph} glyph
 * @param {object} [options]
 * @param {number} [options.height=200] Target height in game pixels.
 * @param {string} [options.color='#ffffff']
 * @param {string} [options.stroke] Outline colour, for the tracing guide.
 * @param {number} [options.em=0] Size by the font's em instead of height.
 * @param {number} [options.strokeWidth=0] A constant line in game pixels.
 * @param {number} [options.strokeEm=0] Line width as a fraction of the font's em.
 * @param {number} [options.padding=0.06] Fraction of height kept as margin.
 * @param {string} [options.partD] One cluster's outline, redrawn over the glyph.
 * @param {string} [options.partColor]
 * @returns {string} The texture key, for `scene.add.image(x, y, key)`.
 */
export function glyphTexture(scene, key, glyph, options = {}) {
  if (scene.textures.exists(key)) return key;

  const {
    height = 200,
    em = 0,
    color = '#ffffff',
    stroke = null,
    strokeWidth = 0,
    strokeEm = 0,
    padding = 0.06,
    partD = null,
    partColor = null,
  } = options;

  const [, , bw, bh] = glyph.bbox;

  // A glyph with no ink (should never happen, the baker fails loudly on it) still needs a texture rather than a crash.
  if (!glyph.d || bw <= 0 || bh <= 0) {
    const blank = scene.textures.createCanvas(key, 2, 2);
    blank.refresh();
    return key;
  }

  // Two ways to be asked for a size, and glyphMetrics() explains when each is right.
  const scale = em > 0 ? em / glyphUpem() : (height - height * padding * 2) / bh;
  const pad = (em > 0 ? em : height) * padding;
  const width = bw * scale + pad * 2;
  const boxHeight = em > 0 ? bh * scale + pad * 2 : height;

  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.ceil(width * SUPERSAMPLE));
  canvas.height = Math.max(1, Math.ceil(boxHeight * SUPERSAMPLE));

  const ctx = canvas.getContext('2d');
  ctx.scale(SUPERSAMPLE, SUPERSAMPLE);
  ctx.translate(pad, pad);
  paintGlyph(ctx, glyph, { scale, color, stroke, strokeWidth, strokeEm, partD, partColor });

  const texture = scene.textures.createCanvas(key, canvas.width, canvas.height);
  texture.context.drawImage(canvas, 0, 0);
  texture.refresh();
  return key;
}

/** Paints one glyph into a 2D context, with its bounding box at the origin.
 * @param {CanvasRenderingContext2D} ctx
 * @param {Glyph} glyph
 * @param {object} options
 * @param {number} options.scale font units to context units
 * @param {string} [options.color]
 * @param {string} [options.stroke]
 * @param {number} [options.strokeWidth] a constant line, in context units
 * @param {number} [options.strokeEm] a line as a fraction of the font's em
 * @param {string} [options.partD] one cluster's outline, drawn over the glyph
 * @param {string} [options.partColor]
 */
export function paintGlyph(ctx, glyph, options) {
  const {
    scale,
    color = '#ffffff',
    stroke = null,
    strokeWidth = 0,
    strokeEm = 0,
    partD = null,
    partColor = null,
  } = options;
  const [bx, by] = glyph.bbox;
  if (!glyph.d) return;

  ctx.save();
  ctx.translate(-bx * scale, -by * scale);
  ctx.scale(scale, scale);

  const path = new Path2D(glyph.d);
  ctx.fillStyle = color;
  ctx.fill(path, 'nonzero');

  // One letter of the word, again, in another colour.
  if (partD && partColor) {
    ctx.fillStyle = partColor;
    ctx.fill(new Path2D(partD), 'nonzero');
  }

  // How big the letterforms themselves are, as opposed to the box they were fitted into.
  const emPixels = scale * glyphUpem();
  const outlined =
    stroke && (strokeWidth > 0 || (strokeEm > 0 && emPixels >= MIN_OUTLINE_EM));

  if (outlined) {
    ctx.strokeStyle = stroke;
    // Two ways to ask for a line, and which one you want depends on what the outline is *for*.
    ctx.lineWidth = strokeEm > 0 ? strokeEm * glyphUpem() : strokeWidth / scale;
    ctx.lineJoin = 'round';
    ctx.stroke(path);
  }
  ctx.restore();
}

/** Adds a glyph to a scene as a correctly sized image.
 * @param {Phaser.Scene} scene
 * @param {number} x
 * @param {number} y
 * @param {string} key
 * @param {Glyph} glyph
 * @param {object} [options] Same options as {@link glyphTexture}.
 * @returns {Phaser.GameObjects.Image}
 */
export function addGlyph(scene, x, y, key, glyph, options = {}) {
  glyphTexture(scene, key, glyph, options);
  const image = scene.add.image(x, y, key);
  image.setScale(1 / SUPERSAMPLE);
  return image;
}

/** Width a glyph will occupy when rendered at `height`, in game pixels.
 * @param {Glyph} glyph
 * @param {number} height
 * @param {number} [padding=0.06]
 */
export function glyphWidth(glyph, height, padding = 0.06) {
  const [, , bw, bh] = glyph.bbox;
  if (bh <= 0) return 0;
  const pad = height * padding;
  return bw * ((height - pad * 2) / bh) + pad * 2;
}

/** Measures a glyph in em units and returns its baseline.
 * @param {import('./glyph.js').Glyph} glyph
 * @param {number} em pixels per em
 * @returns {{width: number, height: number, baseline: number}} in game pixels
 */
export function glyphMetrics(glyph, em, padding = 0.06) {
  const scale = em / glyphUpem();
  const [, by, bw, bh] = glyph.bbox;
  const pad = em * padding;
  return {
    width: bw * scale + pad * 2,
    height: bh * scale + pad * 2,
    baseline: pad - by * scale,
  };
}

/* Adds a glyph sized by the em and sitting on a baseline at `y`. */
export function addGlyphBaseline(scene, x, y, key, glyph, options) {
  const { em } = options;
  const metrics = glyphMetrics(glyph, em, options.padding ?? 0.06);
  glyphTexture(scene, key, glyph, options);
  return scene.add
    .image(x, y, key)
    .setDisplaySize(metrics.width, metrics.height)
    // Origin expressed as a fraction, so `y` is the baseline whatever the glyph's ascenders and descenders happen to be.
    .setOrigin(0.5, metrics.baseline / metrics.height);
}

/** How big each glyph in a set is, per em, in the three directions that bound it.
 * @param {Glyph[]} glyphs
 * @param {number} padding matching glyphTexture's
 */
function extremes(glyphs, padding) {
  const upem = glyphUpem();
  let width = 0;
  let ascent = 0;
  let descent = 0;
  let tallest = 0;

  for (const glyph of glyphs) {
    if (!glyph?.bbox) continue;
    const [, by, bw, bh] = glyph.bbox;
    // Paths are y-down with the baseline at y = 0.
    const above = padding - by / upem;
    const below = (bh + by) / upem + padding;
    width = Math.max(width, bw / upem + padding * 2);
    ascent = Math.max(ascent, above);
    descent = Math.max(descent, below);
    tallest = Math.max(tallest, above + below);
  }

  return { width, ascent, descent, line: ascent + descent, tallest };
}

/** The largest em at which a set of glyphs fits a box **sharing one baseline**, and where that baseline sits.
 * @param {Glyph[]} glyphs every glyph that will be drawn in this box
 * @param {number} boxWidth
 * @param {number} boxHeight
 * @param {number} [padding=0.06] matching glyphTexture's
 * @returns {{em: number, baseline: number, lineHeight: number}}
 */
export function fitEmLine(glyphs, boxWidth, boxHeight, padding = 0.06) {
  const { width, ascent, line } = extremes(glyphs, padding);
  if (width <= 0 || line <= 0) {
    return { em: boxHeight, baseline: boxHeight / 2, lineHeight: 0 };
  }

  const em = Math.min(boxWidth / width, boxHeight / line);
  const lineHeight = em * line;
  return { em, baseline: (boxHeight - lineHeight) / 2 + em * ascent, lineHeight };
}

/** The largest em at which any glyph in a set fits a box **on its own**.
 * @param {Glyph[]} glyphs every glyph that will be drawn in this box
 * @param {number} boxWidth
 * @param {number} boxHeight
 * @param {number} [padding=0.06] matching glyphTexture's
 * @returns {{em: number}} pass it to addGlyph, which centres what it draws
 */
export function fitEmAlone(glyphs, boxWidth, boxHeight, padding = 0.06) {
  const { width, tallest } = extremes(glyphs, padding);
  if (width <= 0 || tallest <= 0) return { em: boxHeight };
  return { em: Math.min(boxWidth / width, boxHeight / tallest) };
}
