/**
 * Draws baked Urdu glyphs.
 *
 * Every Urdu shape in this app comes from here, and none of it goes through
 * Phaser's Text object. The build step (tools/bake-glyphs.mjs) has already run
 * HarfBuzz over the font and produced outline paths, so at runtime there is no
 * shaping, no font loading and no platform variation left to go wrong — just
 * `Path2D` and a fill.
 *
 * @typedef {object} Glyph
 * @property {string} d       SVG path data, y-down, in font units.
 * @property {number[]} bbox  [x, y, width, height] of the inked area.
 * @property {number} advance Advance width of the run.
 */

import { glyphUpem } from './content.js';

/**
 * Supersample factor for rasterised glyphs.
 *
 * Nastaliq has very thin strokes where the pen turns, and those alias badly at
 * 1x. Rendering at 3x and letting the GPU scale down is cheap here because
 * every texture is generated once and cached for the session.
 */
const SUPERSAMPLE = 3;

/**
 * Below this em size, an outline is dropped entirely rather than drawn thin.
 *
 * Nastaliq at label size is already close to the limit of what a screen can
 * resolve — the pen is a pixel or two where it turns — so *any* dark edge
 * closes the counters and the word reads as a smudge rather than as writing.
 * The honest answer at that size is no outline at all: a white glyph on a
 * mid-tone tile has plenty of contrast without one.
 *
 * 50 is not a guess. Measured across the app, every menu label lands between
 * 17 and 42, and every letter drawn as part of a game lands between 67 and 163.
 * Nothing sits near the line.
 */
const MIN_OUTLINE_EM = 50;

/**
 * Builds (or returns a cached) Phaser texture containing one glyph.
 *
 * The glyph is fitted to `height` by its BOUNDING BOX, deliberately ignoring
 * the font baseline. Nastaliq's baseline slopes, and inside a word the glyphs
 * carry large vertical offsets, so baseline-relative placement puts letters
 * wildly off-centre. What a child should see is the ink, centred.
 *
 * @param {Phaser.Scene} scene
 * @param {string} key      Cache key. Must be unique per glyph+size+colour.
 * @param {Glyph} glyph
 * @param {object} [options]
 * @param {number} [options.height=200]  Target height in game pixels.
 * @param {string} [options.color='#ffffff']
 * @param {string} [options.stroke]      Outline colour, for the tracing guide.
 * @param {number} [options.strokeWidth=0] A constant line in game pixels.
 * @param {number} [options.strokeEm=0] A line as a fraction of the font's em,
 *   which keeps it proportional to the letterforms. Wins over strokeWidth.
 * @param {number} [options.padding=0.06] Fraction of height kept as margin.
 * @returns {string} The texture key, for `scene.add.image(x, y, key)`.
 */
export function glyphTexture(scene, key, glyph, options = {}) {
  if (scene.textures.exists(key)) return key;

  const {
    height = 200,
    color = '#ffffff',
    stroke = null,
    strokeWidth = 0,
    strokeEm = 0,
    padding = 0.06,
  } = options;

  const [bx, by, bw, bh] = glyph.bbox;

  // A glyph with no ink (should never happen, the baker fails loudly on it)
  // still needs a texture rather than a crash.
  if (!glyph.d || bw <= 0 || bh <= 0) {
    const blank = scene.textures.createCanvas(key, 2, 2);
    blank.refresh();
    return key;
  }

  const pad = height * padding;
  const scale = (height - pad * 2) / bh;
  const width = bw * scale + pad * 2;

  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.ceil(width * SUPERSAMPLE));
  canvas.height = Math.max(1, Math.ceil(height * SUPERSAMPLE));

  const ctx = canvas.getContext('2d');
  ctx.scale(SUPERSAMPLE, SUPERSAMPLE);
  // Map the glyph's bbox onto the padded canvas.
  ctx.translate(pad - bx * scale, pad - by * scale);
  ctx.scale(scale, scale);

  const path = new Path2D(glyph.d);
  ctx.fillStyle = color;
  ctx.fill(path, 'nonzero');

  // How big the letterforms themselves are, as opposed to the box they were
  // fitted into. Everything about outlining depends on this rather than on
  // `height`; see MIN_OUTLINE_EM and strokeEm below.
  const emPixels = scale * glyphUpem();
  const outlined =
    stroke && (strokeWidth > 0 || (strokeEm > 0 && emPixels >= MIN_OUTLINE_EM));

  if (outlined) {
    ctx.strokeStyle = stroke;
    // Two ways to ask for a line, and which one you want depends on what the
    // outline is *for*.
    //
    // `strokeEm` is a fraction of the font's em, so it scales with the pen that
    // drew the letterforms. That is what a decorative outline wants: a glyph's
    // bounding box says nothing about how thick its strokes are, and Nastaliq
    // makes the gap enormous. گنتی has a deep descender, so at a given display
    // height it is scaled down about ten times harder than a bare ب — and a
    // line specified in screen pixels then lands ten times heavier on it,
    // closing the counters until the word is a black smudge.
    //
    // `strokeWidth` is in game pixels, for the cases that really do want a
    // constant on-screen line whatever the glyph — the tracing guide, which has
    // to stay visible at any size.
    ctx.lineWidth = strokeEm > 0 ? strokeEm * glyphUpem() : strokeWidth / scale;
    ctx.lineJoin = 'round';
    ctx.stroke(path);
  }

  const texture = scene.textures.createCanvas(key, canvas.width, canvas.height);
  texture.context.drawImage(canvas, 0, 0);
  texture.refresh();
  return key;
}

/**
 * Adds a glyph to a scene as a correctly sized image.
 *
 * `glyphTexture` rasterises at SUPERSAMPLE times the requested size, so the
 * sprite has to be scaled back down. Forgetting that is the obvious trap, so
 * this wrapper is what scenes should use.
 *
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

/**
 * Width a glyph will occupy when rendered at `height`, in game pixels.
 * Useful for laying out a row of forms before creating any textures.
 *
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

/**
 * The height to render at so a glyph fits inside a box.
 *
 * Glyphs are sized by height alone, which is fine until the glyph is a wide
 * one. Urdu has some very wide letters — ے and ک run several times their own
 * height — so asking for "height 104" inside a 190px tile silently draws a
 * letter half of which is outside the card. Anything placing a glyph in a
 * bounded space should go through here.
 *
 * @param {Glyph} glyph
 * @param {number} boxWidth
 * @param {number} boxHeight
 * @param {number} [padding=0.06]
 * @returns {number} height in game pixels, never taller than boxHeight
 */
export function fitGlyphHeight(glyph, boxWidth, boxHeight, padding = 0.06) {
  if (!glyph) return boxHeight;
  const wide = glyphWidth(glyph, boxHeight, padding);
  if (wide <= boxWidth || wide <= 0) return boxHeight;
  return boxHeight * (boxWidth / wide);
}
