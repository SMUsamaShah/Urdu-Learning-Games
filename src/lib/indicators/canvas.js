/* Baking helpers shared by the indicators. */

/* Enough to stay crisp on a 2x screen without doubling the memory. */
export const SUPERSAMPLE = 1.5;

/** A canvas to draw into, with the origin put where the drawing wants it.
 * @returns {{canvas: HTMLCanvasElement, ctx: CanvasRenderingContext2D}}
 */
export function makeCanvas(width, height, originX, originY) {
  const canvas = document.createElement('canvas');
  canvas.width = Math.ceil(width * SUPERSAMPLE);
  canvas.height = Math.ceil(height * SUPERSAMPLE);
  const ctx = canvas.getContext('2d');
  ctx.scale(SUPERSAMPLE, SUPERSAMPLE);
  ctx.translate(originX, originY);
  return { canvas, ctx };
}

/* Hands a drawn canvas to Phaser under `key`, and gives the key back. */
export function publish(scene, key, canvas) {
  const texture = scene.textures.createCanvas(key, canvas.width, canvas.height);
  // createCanvas returns null when another scene got there first.
  if (!texture) return key;
  texture.context.drawImage(canvas, 0, 0);
  texture.refresh();
  return key;
}

/* A solid ellipse. */
export function ellipse(ctx, x, y, rx, ry, fill) {
  ctx.fillStyle = fill;
  ctx.beginPath();
  ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
  ctx.fill();
}

/* A rounded rectangle in one colour, as a texture. */
export function slabTexture(scene, key, width, height, radius, fill) {
  if (scene.textures.exists(key)) return key;
  const { canvas, ctx } = makeCanvas(width, height, 0, 0);
  ctx.fillStyle = fill;
  ctx.beginPath();
  ctx.roundRect(0, 0, width, height, radius);
  ctx.fill();
  return publish(scene, key, canvas);
}

/** HSL to a hex string.
 * @param {number} h degrees
 * @param {number} s 0..1
 * @param {number} l 0..1
 */
export function hsl(h, s, l) {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  const [r, g, b] = (() => {
    const sixth = Math.floor(((h % 360) + 360) % 360 / 60);
    if (sixth === 0) return [c, x, 0];
    if (sixth === 1) return [x, c, 0];
    if (sixth === 2) return [0, c, x];
    if (sixth === 3) return [0, x, c];
    if (sixth === 4) return [x, 0, c];
    return [c, 0, x];
  })();
  const byte = (v) =>
    Math.round((v + m) * 255)
      .toString(16)
      .padStart(2, '0');
  return `#${byte(r)}${byte(g)}${byte(b)}`;
}

/* The rail's panel. */
export const PANEL = '#f6ecd8';

/* Relative luminance, for contrast. */
function luminance(hex) {
  const channel = (i) => {
    const v = Number.parseInt(hex.slice(1 + i * 2, 3 + i * 2), 16) / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(0) + 0.7152 * channel(1) + 0.0722 * channel(2);
}

/* The WCAG ratio between two hex colours, lighter over darker. */
export function contrast(a, b) {
  const [x, y] = [luminance(a), luminance(b)];
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}

/* A colour at this hue, darkened until it can be seen against the panel. */
export function readable(h, s = 0.68, l = 0.55, against = PANEL, min = 2.4) {
  let lightness = l;
  let colour = hsl(h, s, lightness);
  while (contrast(colour, against) < min && lightness > 0.16) {
    lightness -= 0.02;
    colour = hsl(h, s, lightness);
  }
  return colour;
}

/* How many levels go by before a colour comes round again. */
export const LEVEL_CYCLE = 20;

/* The hue for step `i` of a cycle of `LEVEL_CYCLE`. */
const HUE_FROM = 170;
const HUE_SPAN = 260;

export function levelHue(i) {
  return (HUE_FROM + (((i * 9) % LEVEL_CYCLE) * HUE_SPAN) / LEVEL_CYCLE) % 360;
}

/* The colour of the thing being filled at a given level. */
export const LEVEL_COLOURS = Array.from({ length: LEVEL_CYCLE }, (unused, i) =>
  readable(levelHue(i))
);

export function levelColour(level) {
  const n = LEVEL_COLOURS.length;
  return LEVEL_COLOURS[((level % n) + n) % n];
}

/* The same, as a number, for tints and particles. */
export function levelTint(level) {
  return Number.parseInt(levelColour(level).slice(1), 16);
}
