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
 * The colour of the thing being filled at a given level.
 *
 * Six, cycling. A child who has filled six of them has been playing for a week
 * and a seventh colour is a smaller reward than the first one coming round
 * again — the same reasoning as the six seeds in the plant.
 */
export const LEVEL_COLOURS = [
  '#3f9ee0',
  '#2fae74',
  '#9b5fc9',
  '#e98a1f',
  '#d94f8c',
  '#f2c230',
];

export function levelColour(level) {
  const n = LEVEL_COLOURS.length;
  return LEVEL_COLOURS[((level % n) + n) % n];
}

/** The same, as a number, for tints and particles. */
export function levelTint(level) {
  return Number.parseInt(levelColour(level).slice(1), 16);
}
