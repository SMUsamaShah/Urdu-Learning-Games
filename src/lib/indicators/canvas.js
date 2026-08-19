/**
 * Baking helpers shared by the indicators.
 *
 * Every one of them draws its fixed parts once into a canvas texture and then
 * animates something cheap on top — a scaled image, a tween — rather than
 * keeping a Graphics alive. A Phaser Graphics re-tessellates its geometry on
 * the CPU every frame whether or not anything about it changed, and the rail's
 * picture changes about once a minute. Same reasoning as scenery.js.
 */

/** Enough to stay crisp on a 2x screen without doubling the memory. */
export const SUPERSAMPLE = 1.5;

/**
 * A canvas to draw into, with the origin put where the drawing wants it.
 *
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

/** Hands a drawn canvas to Phaser under `key`, and gives the key back. */
export function publish(scene, key, canvas) {
  const texture = scene.textures.createCanvas(key, canvas.width, canvas.height);
  // createCanvas returns null when another scene got there first, which is the
  // normal case on the second screen of a session.
  if (!texture) return key;
  texture.context.drawImage(canvas, 0, 0);
  texture.refresh();
  return key;
}

/** A solid ellipse. Used often enough to be worth not writing out each time. */
export function ellipse(ctx, x, y, rx, ry, fill) {
  ctx.fillStyle = fill;
  ctx.beginPath();
  ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
  ctx.fill();
}

/** A rounded rectangle in one colour, as a texture. */
export function slabTexture(scene, key, width, height, radius, fill) {
  if (scene.textures.exists(key)) return key;
  const { canvas, ctx } = makeCanvas(width, height, 0, 0);
  ctx.fillStyle = fill;
  ctx.beginPath();
  ctx.roundRect(0, 0, width, height, radius);
  ctx.fill();
  return publish(scene, key, canvas);
}

/**
 * HSL to a hex string.
 *
 * The one piece of colour arithmetic in the app, and it is here because the two
 * palettes that need it are here and in greenery.js. Twenty colours picked by
 * hand is twenty chances to choose one that vanishes against the rail's cream
 * panel — a white jasmine was authored into the first six and was invisible —
 * so they are generated at a fixed saturation and lightness instead, where the
 * only thing that varies is the one thing that has to.
 *
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

/** The rail's panel. Everything drawn in it has to be visible against this. */
export const PANEL = '#f6ecd8';

/** Relative luminance, for contrast. */
function luminance(hex) {
  const channel = (i) => {
    const v = Number.parseInt(hex.slice(1 + i * 2, 3 + i * 2), 16) / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(0) + 0.7152 * channel(1) + 0.0722 * channel(2);
}

/** The WCAG ratio between two hex colours, lighter over darker. */
export function contrast(a, b) {
  const [x, y] = [luminance(a), luminance(b)];
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}

/**
 * A colour at this hue, darkened until it can be seen against the panel.
 *
 * The same lightness reads very differently by hue — a yellow at HSL 53% is
 * far brighter to the eye than a blue at 53%, and on a cream panel the yellow
 * is the one that disappears. Rather than hand-tuning twenty lightnesses, this
 * walks one down until the contrast clears the bar, so a hue that happens to be
 * a pale one is fixed by arithmetic instead of by somebody noticing.
 *
 * The bar is 2.4 rather than a text ratio: these are large solid shapes with
 * their own outlines and highlights, not letterforms.
 */
export function readable(h, s = 0.68, l = 0.55, against = PANEL, min = 2.4) {
  let lightness = l;
  let colour = hsl(h, s, lightness);
  while (contrast(colour, against) < min && lightness > 0.16) {
    lightness -= 0.02;
    colour = hsl(h, s, lightness);
  }
  return colour;
}

/** How many levels go by before a colour comes round again. */
export const LEVEL_CYCLE = 20;

/**
 * The hue for step `i` of a cycle of `LEVEL_CYCLE`.
 *
 * Two things are going on here.
 *
 * **The green quarter of the wheel is skipped.** The twenty hues are drawn from
 * 170° round to 70°, which is cyan through blue, violet, magenta, red, orange
 * to yellow — everything except green. The first version stepped evenly round
 * the whole wheel and put six green flowers into the twenty; a green blossom on
 * a green vine, among green leaves, is a flower nobody can see. The bar and the
 * glass would have been fine with green, but one wheel for all of them is worth
 * more than a green bar: whatever a child has chosen to look at, level nine is
 * the same colour of thing.
 *
 * **The steps are not in order.** Stepped by nine twentieths of the range
 * rather than one twentieth — both visit all twenty, since nine and twenty
 * share no factor, but going round in order would make level 8 and level 9
 * neighbouring shades of the same blue, and consecutive levels are the only
 * comparison a child actually makes.
 */
const HUE_FROM = 170;
const HUE_SPAN = 260;

export function levelHue(i) {
  return (HUE_FROM + (((i * 9) % LEVEL_CYCLE) * HUE_SPAN) / LEVEL_CYCLE) % 360;
}

/**
 * The colour of the thing being filled at a given level.
 *
 * Twenty, cycling. It was six, which meant a child on their seventh level saw
 * a colour they had already filled and the app had nothing new to show after a
 * week. Twenty is about two months of daily playing.
 */
export const LEVEL_COLOURS = Array.from({ length: LEVEL_CYCLE }, (unused, i) =>
  readable(levelHue(i))
);

export function levelColour(level) {
  const n = LEVEL_COLOURS.length;
  return LEVEL_COLOURS[((level % n) + n) % n];
}

/** The same, as a number, for tints and particles. */
export function levelTint(level) {
  return Number.parseInt(levelColour(level).slice(1), 16);
}
