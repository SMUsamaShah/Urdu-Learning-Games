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

/**
 * Supersample factor for rasterised glyphs.
 *
 * Nastaliq has very thin strokes where the pen turns, and those alias badly at
 * 1x. Rendering at 3x and letting the GPU scale down is cheap here because
 * every texture is generated once and cached for the session.
 */
const SUPERSAMPLE = 3;

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
 * @param {number} [options.strokeWidth=0]
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

  if (stroke && strokeWidth > 0) {
    ctx.strokeStyle = stroke;
    // Stroke width is given in game pixels, so undo the glyph scale.
    ctx.lineWidth = strokeWidth / scale;
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
