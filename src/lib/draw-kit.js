/**
 * One pen for everything this app draws by hand.
 *
 * The menu tiles proved the approach: rounded rectangles, circles, polygons,
 * curves and baked glyphs, out of one palette, produce twenty-five pictures
 * that look like one set. The play area wants the same thing at a larger size —
 * a basket that looks like a basket, a caterpillar that looks like a
 * caterpillar — and the surest way for the two to drift apart is for each to
 * have its own idea of what a rounded rectangle is.
 *
 * So the kit lives here and both use it: src/lib/tile-faces.js for the menu,
 * src/lib/props.js for the furniture of a game screen.
 *
 * Deliberately small. A kit that grows a method per picture is a kit that has
 * stopped enforcing a house style; anything more specific is built out of these
 * in the module that needs it.
 */

import { letterGlyph, numberGlyph, wordGlyph } from './content.js';
import { paintGlyph } from './glyph.js';
import { COLORS } from './theme.js';

export const INK = COLORS.outlineCss;
export const PAPER = '#ffffff';

/** Colours that are about the world rather than about the tile. */
export const LEAF = '#5f9e5a';
export const GRASS = '#7cb342';
export const WOOD = '#c08b52';
export const WATER = '#69b7de';
export const FRUIT = '#d9534f';
export const SUN = '#f7c948';
export const SLATE = '#e9ecf5';

const clamp01 = (n) => Math.min(1, Math.max(0, n));

const channels = (css) => [
  Number.parseInt(css.slice(1, 3), 16),
  Number.parseInt(css.slice(3, 5), 16),
  Number.parseInt(css.slice(5, 7), 16),
];

/** `t` of the way from `a` to `b`. */
export function mix(a, b, t) {
  const [ar, ag, ab] = channels(a);
  const [br, bg, bb] = channels(b);
  const at = clamp01(t);
  const to = (x, y) => Math.round(x + (y - x) * at).toString(16).padStart(2, '0');
  return `#${to(ar, br)}${to(ag, bg)}${to(ab, bb)}`;
}

/**
 * Five tones from the game's own colour.
 *
 * Every face is drawn from these plus the world colours above, which is what
 * keeps twenty-five different scenes looking like one set.
 */
export function palette(color) {
  const base = `#${(color >>> 0).toString(16).padStart(6, '0')}`;
  return {
    base,
    dark: mix(base, '#101423', 0.34),
    mid: mix(base, PAPER, 0.28),
    light: mix(base, PAPER, 0.62),
    pale: mix(base, PAPER, 0.86),
    // Two more hues, a triad around the game's own.
    //
    // Tones of one colour is what made the first set of tiles read as muted:
    // twenty-five pictures each drawn in one hue plus grey, where the app they
    // are chasing puts four or five real colours in every icon. Rotating the
    // hue rather than picking from a list keeps a tile's three colours related
    // to each other and to the tile next to it, which is the thing a fixed
    // rainbow palette loses.
    warm: rotate(base, 138),
    cool: rotate(base, -138),
  };
}

/**
 * The same colour, `degrees` around the wheel, at a saturation and lightness
 * that suit a large flat shape.
 *
 * Clamped rather than preserved: several of the games' colours are muddy —
 * 0x7d6a3f is a khaki — and rotating a muddy hue gives another muddy colour,
 * which is exactly the problem this is here to fix.
 */
function rotate(css, degrees) {
  const [r, g, b] = channels(css).map((v) => v / 255);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const span = max - min;
  let hue = 0;
  if (span > 0) {
    if (max === r) hue = ((g - b) / span) % 6;
    else if (max === g) hue = (b - r) / span + 2;
    else hue = (r - g) / span + 4;
  }
  hue = (hue * 60 + degrees + 360) % 360;
  return hsl(hue, 0.62, 0.55);
}

/** An HSL colour as `#rrggbb`. */
function hsl(hue, saturation, lightness) {
  const chroma = (1 - Math.abs(2 * lightness - 1)) * saturation;
  const second = chroma * (1 - Math.abs(((hue / 60) % 2) - 1));
  const offset = lightness - chroma / 2;
  const sector = Math.floor(hue / 60) % 6;
  const rgb = [
    [chroma, second, 0],
    [second, chroma, 0],
    [0, chroma, second],
    [0, second, chroma],
    [second, 0, chroma],
    [chroma, 0, second],
  ][sector];
  return `#${rgb
    .map((v) => Math.round((v + offset) * 255).toString(16).padStart(2, '0'))
    .join('')}`;
}

// ------------------------------------------------------------------- the pen

/**
 * The drawing kit a face is handed.
 *
 * Deliberately small: rounded rectangles, circles, ellipses, polygons, lines,
 * arcs and glyphs. A face that needs something else builds it out of these,
 * because a kit that grows a method per face is a kit that stops enforcing a
 * house style.
 */
export function pen(ctx, width, height, color) {
  const p = palette(color);

  const stroked = (fill, stroke, lw, dash) => {
    if (fill) {
      ctx.fillStyle = fill;
      ctx.fill();
    }
    if (stroke) {
      ctx.strokeStyle = stroke;
      ctx.lineWidth = lw;
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';
      ctx.setLineDash(dash ?? []);
      ctx.stroke();
      ctx.setLineDash([]);
    }
  };

  const kit = {
    ctx,
    w: width,
    h: height,
    p,

    /** A rounded rectangle centred on (x, y). */
    rrect(x, y, w, h, r, { fill, stroke, lw = 3, dash, rotate = 0 } = {}) {
      ctx.save();
      ctx.translate(x, y);
      if (rotate) ctx.rotate(rotate);
      const rad = Math.min(r, w / 2, h / 2);
      ctx.beginPath();
      ctx.roundRect(-w / 2, -h / 2, w, h, rad);
      stroked(fill, stroke, lw, dash);
      ctx.restore();
    },

    circle(x, y, r, options = {}) {
      kit.ellipse(x, y, r, r, options);
    },

    ellipse(x, y, rx, ry, { fill, stroke, lw = 3, dash, rotate = 0 } = {}) {
      ctx.beginPath();
      ctx.ellipse(x, y, Math.abs(rx), Math.abs(ry), rotate, 0, Math.PI * 2);
      stroked(fill, stroke, lw, dash);
    },

    /** @param {number[][]} points */
    poly(points, { fill, stroke, lw = 3, dash, close = true } = {}) {
      ctx.beginPath();
      points.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
      if (close) ctx.closePath();
      stroked(fill, stroke, lw, dash);
    },

    line(x1, y1, x2, y2, { stroke = INK, lw = 3, dash } = {}) {
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      stroked(null, stroke, lw, dash);
    },

    /** A quadratic through one control point — strings, tails, water. */
    curve(x1, y1, cx, cy, x2, y2, { stroke = INK, lw = 3, dash } = {}) {
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.quadraticCurveTo(cx, cy, x2, y2);
      stroked(null, stroke, lw, dash);
    },

    arc(x, y, r, from, to, { stroke = INK, lw = 3, dash, fill } = {}) {
      ctx.beginPath();
      ctx.arc(x, y, r, from, to);
      stroked(fill, stroke, lw, dash);
    },

    /** Everything drawn by `body` is kept inside `shape`. */
    inside(shape, body) {
      ctx.save();
      ctx.beginPath();
      shape(ctx);
      ctx.clip();
      body();
      ctx.restore();
    },

    /**
     * A baked glyph, its inked area centred on (x, y) and `height` tall.
     *
     * By the bounding box rather than by the em, which is the opposite of what
     * a row of letters wants and exactly what a letter drawn as an *object*
     * wants: a letter on a balloon should fill the balloon whether it is a ب
     * or a گ. Letters that have to match each other in a face are given the
     * same height and drawn from the same family, which is near enough at
     * tile size.
     */
    glyph(glyph, x, y, height, { fill = INK, stroke, strokeEm = 0, dash, rotate = 0, maxWidth } = {}) {
      if (!glyph?.d) return;
      const [, , bw, bh] = glyph.bbox;
      if (!(bh > 0)) return;
      let scale = height / bh;
      if (maxWidth && bw * scale > maxWidth) scale = maxWidth / bw;
      ctx.save();
      ctx.translate(x, y);
      if (rotate) ctx.rotate(rotate);
      ctx.translate((-bw * scale) / 2, (-bh * scale) / 2);
      if (dash) ctx.setLineDash(dash);
      paintGlyph(ctx, glyph, { scale, color: fill, stroke, strokeEm });
      ctx.setLineDash([]);
      ctx.restore();
    },

    letter(id, form, x, y, height, options) {
      kit.glyph(letterGlyph(id, form), x, y, height, options);
    },

    numeral(id, x, y, height, options) {
      kit.glyph(numberGlyph(id), x, y, height, options);
    },

    word(id, x, y, height, options) {
      kit.glyph(wordGlyph(id), x, y, height, options);
    },

    /** Fills everything below `y`. Faces are clipped to the panel, so it bleeds. */
    ground(y, fill) {
      ctx.fillStyle = fill;
      // Twice the panel in both directions, so this is still a fill to the
      // bottom edge when it is called from inside a clip that starts above the
      // panel's own top — which is how the water is drawn.
      ctx.fillRect(-width, y, width * 2, height * 2);
    },
  };
  return kit;
}
