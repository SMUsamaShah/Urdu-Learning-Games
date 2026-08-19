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
 * @param {number} [options.em=0] Size the glyph by the font's em rather than by
 *   its bounding box. Wins over `height`. See glyphMetrics() for why.
 * @param {number} [options.strokeWidth=0] A constant line in game pixels.
 * @param {number} [options.strokeEm=0] A line as a fraction of the font's em,
 *   which keeps it proportional to the letterforms. Wins over strokeWidth.
 * @param {number} [options.padding=0.06] Fraction of height kept as margin.
 * @param {string} [options.partD] One cluster's outline, redrawn in
 *   `partColor` over the finished glyph. See paintGlyph.
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

  // A glyph with no ink (should never happen, the baker fails loudly on it)
  // still needs a texture rather than a crash.
  if (!glyph.d || bw <= 0 || bh <= 0) {
    const blank = scene.textures.createCanvas(key, 2, 2);
    blank.refresh();
    return key;
  }

  // Two ways to be asked for a size, and glyphMetrics() explains when each is
  // right. `em` makes the letterforms a fixed size and lets the box vary;
  // `height` makes the box a fixed size and lets the letterforms vary.
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

/**
 * Paints one glyph into a 2D context, with its bounding box at the origin.
 *
 * Split out of glyphTexture so a caller that is already drawing a canvas can
 * put a letter on it without minting a texture for the letter alone. The menu
 * bakes each tile — card, picture, caption band, Urdu name, roman gloss — into
 * a single texture that way, which took the menu from five textures and three
 * overlapping quads per tile down to one of each.
 *
 * The context's transform is respected and restored, so the caller positions
 * the glyph by translating before the call.
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {Glyph} glyph
 * @param {object} options
 * @param {number} options.scale font units to context units
 * @param {string} [options.color]
 * @param {string} [options.stroke]
 * @param {number} [options.strokeWidth] a constant line, in context units
 * @param {number} [options.strokeEm] a line as a fraction of the font's em
 * @param {string} [options.partD] one cluster's outline, drawn again over the
 *   whole glyph in `partColor` — see the note below
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
  //
  // Drawn over the finished word rather than instead of part of it, and in the
  // same coordinates, so it lands exactly on top of the shape already there —
  // which is the only way to do this with an outline that was shaped as a
  // whole. `partD` is a cluster's own `d` from content/glyphs.json; which
  // cluster, and whether there is one worth using, is the caller's problem.
  // See clustersOf() in tools/bake-glyphs.mjs for why it is usually not.
  if (partD && partColor) {
    ctx.fillStyle = partColor;
    ctx.fill(new Path2D(partD), 'nonzero');
  }

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
  ctx.restore();
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

// `fitGlyphHeight` used to live here — pick a height, then shrink it if the
// glyph came out too wide. It was replaced by fitEmLine/fitEmAlone below,
// which size in ems from the whole set rather than per glyph, and so give a
// row of letters one consistent size instead of each one its own.

/**
 * What a glyph measures when sized by the font's em, and where its baseline is.
 *
 * ## Which of the two sizings to use
 *
 * `height` fits a glyph's **bounding box** to a number of pixels. That is right
 * when one glyph should fill a space on its own — a letter in a tile, the hero
 * on a flashcard — because it makes it as large as the space allows.
 *
 * It is wrong the moment two glyphs are seen side by side, because a bounding
 * box says nothing about how big the letters inside it are. گنتی has a deep
 * descender on its ی, so its box is tall and mostly empty; جوڑے's is short and
 * full. Fitted to the same height, گنتی's letterforms come out about a third
 * the size of جوڑے's, and a row of menu labels looks like a mistake.
 *
 * `em` is the same measure a font size is: units per em, so the *letters* are a
 * fixed size and the box varies. That is what a row of labels wants.
 *
 * ## The baseline
 *
 * Sizing by em only fixes half of it. Two strings at the same em still have
 * different box heights, so centring them vertically leaves them visibly
 * unaligned — one riding high because it has no descender. Text sits on a
 * baseline instead, which is why this returns one.
 *
 * The baker emits paths y-down with the baseline at y = 0 (see
 * tools/bake-glyphs.mjs), so the baseline within the texture is simply the top
 * padding plus however far the glyph reaches above it.
 *
 * @param {import('./glyph.js').Glyph} glyph
 * @param {number} em pixels per em
 * @returns {{width: number, height: number, baseline: number}} in game pixels,
 *   with `baseline` measured down from the top of the texture.
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

/**
 * Adds a glyph sized by the em and sitting on a baseline at `y`.
 *
 * Not interchangeable with addGlyph: that one centres the glyph's box on
 * `(x, y)`, this one puts its baseline there, so a row of these line up the way
 * written text does.
 */
export function addGlyphBaseline(scene, x, y, key, glyph, options) {
  const { em } = options;
  const metrics = glyphMetrics(glyph, em, options.padding ?? 0.06);
  glyphTexture(scene, key, glyph, options);
  return scene.add
    .image(x, y, key)
    .setDisplaySize(metrics.width, metrics.height)
    // Origin expressed as a fraction, so `y` is the baseline whatever the
    // glyph's ascenders and descenders happen to be.
    .setOrigin(0.5, metrics.baseline / metrics.height);
}

/**
 * How big each glyph in a set is, per em, in the three directions that bound it.
 *
 * The whole point of em sizing is that every glyph in a set comes out the same
 * size, so the size has to be settled by the most demanding member of the set
 * rather than by whichever one happens to be on screen. Everything below works
 * from a set for that reason; called with one glyph it would just reintroduce
 * the bug somewhere new.
 *
 * In Nastaliq the members are wildly far apart — across the alphabet the tallest
 * letter's ink is three and a half times the shortest's, and گ reaches an em and
 * a half above the baseline where most letters reach four fifths of one — so
 * which extreme is measured really matters. Hence both `line` and `tallest`:
 * see the two fitters below.
 *
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
    // Paths are y-down with the baseline at y = 0, so `by` — the top of the ink
    // — is negative for anything reaching above the baseline.
    const above = padding - by / upem;
    const below = (bh + by) / upem + padding;
    width = Math.max(width, bw / upem + padding * 2);
    ascent = Math.max(ascent, above);
    descent = Math.max(descent, below);
    tallest = Math.max(tallest, above + below);
  }

  return { width, ascent, descent, line: ascent + descent, tallest };
}

/**
 * The largest em at which a set of glyphs fits a box **sharing one baseline**,
 * and where that baseline sits.
 *
 * For glyphs read together as a line: a menu label under its icon, the row of
 * form names, the letters along the caterpillar. They have to line up the way
 * written text does, so the box has to be deep enough for the highest ascender
 * in the set and the deepest descender in the set *at the same time* — even
 * though no single glyph has both. That reservation costs about a third of the
 * available size, which is the price of the alignment. Where a glyph is alone in
 * its own card there is nothing to line up with and nothing to pay, so use
 * fitEmAlone instead.
 *
 * The baseline is returned measured from the top of the box, so a caller writes
 * `boxTop + fit.baseline` and every glyph in the set lands on the same line
 * whether or not it happens to have an ascender or a descender.
 *
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

/**
 * The largest em at which any glyph in a set fits a box **on its own**.
 *
 * For a glyph that is the only thing in its card: a letter on a tile, on a
 * balloon, on a memory card, in a strip cell, the big letter on a flashcard.
 * Each is centred in its own box, so there is no shared baseline to hold and the
 * limit is simply the tallest single glyph rather than the tallest ascender
 * stacked on the deepest descender. That is worth about a third more size, which
 * on a tile a three-year-old is squinting at is the difference between a letter
 * and a mark.
 *
 * Still measured across the set, and that is the part that matters: it is what
 * stops ہ being drawn three times the size of ل, and in a game where the child
 * picks between four cards it is what stops size being a way to guess.
 *
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
