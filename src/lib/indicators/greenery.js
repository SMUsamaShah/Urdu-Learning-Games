import { ellipse, hsl, levelHue, makeCanvas, publish, readable } from './canvas.js';

/* The parts a growing thing in the rail is built from. */

/* Twenty names, in the order they are planted. */
const NAMES = [
  'rose', 'tulip', 'dahlia', 'aster', 'zinnia',
  'cosmos', 'poppy', 'iris', 'lily', 'hibiscus',
  'pansy', 'petunia', 'anemone', 'camellia', 'freesia',
  'primrose', 'gladiolus', 'ranunculus', 'sweetpea', 'chrysanth',
];

/* Four greens, cycled under the flowers. */
const GREENS = [
  { leaf: '#54a83f', shade: '#3d8730' },
  { leaf: '#4f9f4a', shade: '#3a7c37' },
  { leaf: '#6fae35', shade: '#578f28' },
  { leaf: '#3f9e56', shade: '#2f7f42' },
];

/* What is growing, cycling by level. */
export const VARIETIES = NAMES.map((id, i) => ({
  id,
  ...GREENS[i % GREENS.length],
  flower: readable(levelHue(i)),
  // The petal highlight: same hue, much lighter.
  gloss: hsl(levelHue(i), 0.8, 0.8),
}));

/* Which one is growing at a given level. */
export function varietyFor(level) {
  const n = VARIETIES.length;
  return VARIETIES[((Math.floor(level) % n) + n) % n];
}

const CLAY = '#c9713f';
const CLAY_DARK = '#a95a30';
const CLAY_RIM = '#dc8049';
const SOIL = '#4a3020';
const CANE = '#b9925a';
const CANE_DARK = '#94703f';
const CANE_NODE = '#7d5c32';
const BARK = '#8a5f39';
const BARK_LIGHT = '#a1734a';

/* The pot's drawing, in design pixels, measured up from its base. */
export const POT = { topWidth: 92, baseWidth: 66, height: 50, rim: 12 };

/* One length of stem, before it is stretched to the height of a cell. */
export const STEM = { width: 68, height: 100, bow: 22 };

/* One leaf, at the size it is drawn. */
export const LEAF = { reach: 58, drop: 18, lift: 24 };

/* Where the leaf texture's join sits inside its own frame, as an origin. */
export const LEAF_ORIGIN = {
  x: 10 / (LEAF.reach + 20),
  y: (LEAF.lift + 8) / (LEAF.lift + LEAF.drop + 16),
};

/* The pot, with soil in it. */
export function potTexture(scene) {
  const key = 'greenery:pot';
  if (scene.textures.exists(key)) return key;

  const width = POT.topWidth + 16;
  const height = POT.height + POT.rim + 6;
  const { canvas, ctx } = makeCanvas(width, height, width / 2, height);
  const { topWidth, baseWidth, rim } = POT;
  const top = -POT.height;

  // Soil first, so the rim is drawn over its front edge and the pot reads as something with a depth rather than a shape.
  ellipse(ctx, 0, top - rim + 5, topWidth / 2 - 5, 9, SOIL);

  ctx.fillStyle = CLAY;
  ctx.beginPath();
  ctx.moveTo(-topWidth / 2, top);
  ctx.lineTo(topWidth / 2, top);
  ctx.lineTo(baseWidth / 2, 0);
  ctx.lineTo(-baseWidth / 2, 0);
  ctx.closePath();
  ctx.fill();

  // A flat shaded side rather than a gradient.
  ctx.fillStyle = CLAY_DARK;
  ctx.beginPath();
  ctx.moveTo(topWidth / 2 - 18, top);
  ctx.lineTo(topWidth / 2, top);
  ctx.lineTo(baseWidth / 2, 0);
  ctx.lineTo(baseWidth / 2 - 13, 0);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = CLAY_RIM;
  ctx.beginPath();
  ctx.roundRect(-topWidth / 2 - 5, top - rim, topWidth + 10, rim + 4, 5);
  ctx.fill();

  return publish(scene, key, canvas);
}

/* A strip of grass across the foot of the rail. */
export function groundTexture(scene, width) {
  const key = `greenery:ground:${Math.round(width)}`;
  if (scene.textures.exists(key)) return key;
  const { canvas, ctx } = makeCanvas(width, 54, width / 2, 54);
  ellipse(ctx, 0, -6, width / 2 - 4, 30, '#5da13f');
  ellipse(ctx, 0, -14, width / 2 - 12, 24, '#79bd55');
  return publish(scene, key, canvas);
}

/* The cane the vine climbs, floor to ceiling. */
export function caneTexture(scene, height) {
  const key = `greenery:cane:${Math.round(height)}`;
  if (scene.textures.exists(key)) return key;

  const width = 30;
  const { canvas, ctx } = makeCanvas(width, height, width / 2, height);
  const half = 9;

  // Tapering slightly towards the top.
  ctx.fillStyle = CANE;
  ctx.beginPath();
  ctx.moveTo(-half, 0);
  ctx.lineTo(half, 0);
  ctx.lineTo(half - 2.5, -height);
  ctx.lineTo(-half + 2.5, -height);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = CANE_DARK;
  ctx.fillRect(half - 5, -height, 5, height);

  // Space nodes evenly along the stem.
  ctx.strokeStyle = CANE_NODE;
  ctx.lineWidth = 2.5;
  const gap = 92;
  for (let y = -gap; y > -height + 12; y -= gap) {
    ctx.beginPath();
    ctx.moveTo(-half, y);
    ctx.lineTo(half, y);
    ctx.stroke();
  }

  // A rounded cap, so the top is an end rather than a cut.
  ellipse(ctx, 0, -height + 2, half - 2.5, 4, CANE);

  return publish(scene, key, canvas);
}

/* A bare tree, drawn to the height it is given: trunk, two pairs of branches. */
export function trunkTexture(scene, height, spread) {
  const key = `greenery:trunk:${Math.round(height)}:${Math.round(spread)}`;
  if (scene.textures.exists(key)) return key;

  const width = spread * 2 + 24;
  const { canvas, ctx } = makeCanvas(width, height, width / 2, height);
  const base = 15;
  const tip = 5;

  ctx.fillStyle = BARK;
  ctx.beginPath();
  ctx.moveTo(-base, 0);
  ctx.quadraticCurveTo(-base * 0.5, -height * 0.5, -tip, -height);
  ctx.lineTo(tip, -height);
  ctx.quadraticCurveTo(base * 0.5, -height * 0.5, base, 0);
  ctx.closePath();
  ctx.fill();

  // The lit side, down the left, where the sun is on every other drawing here.
  ctx.fillStyle = BARK_LIGHT;
  ctx.beginPath();
  ctx.moveTo(-base, 0);
  ctx.quadraticCurveTo(-base * 0.5, -height * 0.5, -tip, -height);
  ctx.lineTo(-tip + 3, -height);
  ctx.quadraticCurveTo(-base * 0.5 + 6, -height * 0.5, -base + 7, 0);
  ctx.closePath();
  ctx.fill();

  ctx.strokeStyle = BARK;
  ctx.lineCap = 'round';
  for (const [at, reach, rise] of [
    [0.52, 0.78, 0.2],
    [0.76, 0.62, 0.16],
  ]) {
    const y = -height * at;
    ctx.lineWidth = 9 * (1 - at * 0.5);
    for (const side of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(side * 4, y);
      ctx.quadraticCurveTo(
        side * spread * reach * 0.6,
        y - height * rise * 0.35,
        side * spread * reach,
        y - height * rise
      );
      ctx.stroke();
    }
  }

  return publish(scene, key, canvas);
}

/* One length of stem: out to one side and back, so a run of them twines. */
export function stemTexture(scene, variety) {
  const key = `greenery:stem:${variety.id}`;
  if (scene.textures.exists(key)) return key;

  const { canvas, ctx } = makeCanvas(STEM.width, STEM.height, STEM.width / 2, STEM.height);
  // The apex of a quadratic sits half way to its control point, so the control is twice the bow.
  const control = STEM.bow * 2;

  ctx.lineCap = 'round';
  ctx.strokeStyle = variety.shade;
  ctx.lineWidth = 9;
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.quadraticCurveTo(control, -STEM.height / 2, 0, -STEM.height);
  ctx.stroke();

  ctx.strokeStyle = variety.leaf;
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(-1, -2);
  ctx.quadraticCurveTo(control - 3, -STEM.height / 2, -1, -STEM.height + 2);
  ctx.stroke();

  return publish(scene, key, canvas);
}

/* One leaf, joined at the origin and reaching right and a little upwards. */
export function leafTexture(scene, variety) {
  const key = `greenery:leaf:${variety.id}`;
  if (scene.textures.exists(key)) return key;

  const width = LEAF.reach + 20;
  const height = LEAF.lift + LEAF.drop + 16;
  const { canvas, ctx } = makeCanvas(width, height, 10, LEAF.lift + 8);

  ctx.fillStyle = variety.leaf;
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.quadraticCurveTo(LEAF.reach * 0.42, -LEAF.lift, LEAF.reach, -LEAF.lift * 0.42);
  ctx.quadraticCurveTo(LEAF.reach * 0.46, LEAF.drop, 0, 0);
  ctx.fill();

  // The underside, along the lower edge, and the midrib.
  ctx.fillStyle = variety.shade;
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.quadraticCurveTo(LEAF.reach * 0.46, LEAF.drop, LEAF.reach, -LEAF.lift * 0.42);
  ctx.quadraticCurveTo(LEAF.reach * 0.5, LEAF.drop * 0.5, 0, 0);
  ctx.fill();

  ctx.strokeStyle = variety.shade;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(2, -1);
  ctx.quadraticCurveTo(LEAF.reach * 0.5, -LEAF.lift * 0.3, LEAF.reach - 4, -LEAF.lift * 0.4);
  ctx.stroke();

  return publish(scene, key, canvas);
}

/* The growing tip: a closed bud, showing what colour it is going to open. */
export function budTexture(scene, variety) {
  const key = `greenery:bud:${variety.id}`;
  if (scene.textures.exists(key)) return key;

  const { canvas, ctx } = makeCanvas(40, 52, 20, 52);

  // Two little leaves at the base, so a bud at step zero is a seedling rather than a bead sitting on the soil.
  ctx.fillStyle = variety.shade;
  ctx.beginPath();
  ctx.ellipse(-9, -10, 11, 6, -0.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(9, -10, 11, 6, 0.5, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = variety.shade;
  ctx.lineWidth = 5;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(0, -6);
  ctx.lineTo(0, -26);
  ctx.stroke();

  ellipse(ctx, 0, -34, 10, 14, variety.leaf);
  ellipse(ctx, 0, -41, 6, 7, variety.flower);

  return publish(scene, key, canvas);
}

/** An open flower, centred on the origin.
 * @param {number} size across, so the same drawing serves the one that opens
 */
export function flowerTexture(scene, variety, size) {
  const key = `greenery:flower:${variety.id}:${Math.round(size)}`;
  if (scene.textures.exists(key)) return key;

  const { canvas, ctx } = makeCanvas(size + 8, size + 8, (size + 8) / 2, (size + 8) / 2);
  const petal = size * 0.29;
  const ring = size * 0.3;

  for (let i = 0; i < 5; i++) {
    const angle = (i / 5) * Math.PI * 2 - Math.PI / 2;
    ellipse(ctx, Math.cos(angle) * ring, Math.sin(angle) * ring, petal, petal, variety.flower);
  }
  for (let i = 0; i < 5; i++) {
    const angle = (i / 5) * Math.PI * 2 - Math.PI / 2;
    ellipse(
      ctx,
      Math.cos(angle) * ring * 0.94,
      Math.sin(angle) * ring * 0.94 - petal * 0.16,
      petal * 0.62,
      petal * 0.56,
      variety.gloss
    );
  }
  ellipse(ctx, 0, 0, size * 0.19, size * 0.19, '#f7d24a');
  ellipse(ctx, -size * 0.05, -size * 0.05, size * 0.08, size * 0.07, '#fff0a8');

  return publish(scene, key, canvas);
}

/* A round fruit with a highlight, for the tree. */
export function fruitTexture(scene, variety, size) {
  const key = `greenery:fruit:${variety.id}:${Math.round(size)}`;
  if (scene.textures.exists(key)) return key;
  const { canvas, ctx } = makeCanvas(size + 6, size + 6, (size + 6) / 2, (size + 6) / 2);
  ellipse(ctx, 0, 0, size / 2, size / 2, variety.flower);
  ellipse(ctx, -size * 0.15, -size * 0.16, size * 0.16, size * 0.13, variety.gloss);
  return publish(scene, key, canvas);
}

/* A clump of leaves, for the tree's canopy. */
export function clumpTexture(scene, variety, size) {
  const key = `greenery:clump:${variety.id}:${Math.round(size)}`;
  if (scene.textures.exists(key)) return key;
  const { canvas, ctx } = makeCanvas(size + 6, size + 6, (size + 6) / 2, (size + 6) / 2);
  const r = size / 2;
  ellipse(ctx, 0, 0, r, r * 0.9, variety.shade);
  ellipse(ctx, -r * 0.16, -r * 0.22, r * 0.76, r * 0.66, variety.leaf);
  return publish(scene, key, canvas);
}

/* A ladybird, facing up the cane. */
export function ladybirdTexture(scene) {
  const key = 'greenery:ladybird';
  if (scene.textures.exists(key)) return key;

  const { canvas, ctx } = makeCanvas(46, 44, 23, 22);

  ctx.strokeStyle = '#2b2f36';
  ctx.lineWidth = 3;
  ctx.lineCap = 'round';
  for (const [x, y, dx, dy] of [
    [-9, -6, -8, -6],
    [-11, 0, -10, 0],
    [-9, 6, -8, 7],
    [9, -6, 8, -6],
    [11, 0, 10, 0],
    [9, 6, 8, 7],
  ]) {
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + dx, y + dy);
    ctx.stroke();
  }

  ellipse(ctx, 0, 1, 14, 13, '#d93b34');
  // The head at the top.
  ellipse(ctx, 0, -11, 8, 7, '#2b2f36');
  ctx.strokeStyle = '#2b2f36';
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.moveTo(0, -6);
  ctx.lineTo(0, 13);
  ctx.stroke();

  for (const [x, y, r] of [
    [-7, -3, 3.2],
    [7, -3, 3.2],
    [-6, 7, 2.8],
    [6, 7, 2.8],
  ]) {
    ellipse(ctx, x, y, r, r, '#2b2f36');
  }

  ellipse(ctx, -3, -12, 1.8, 1.8, '#ffffff');
  ellipse(ctx, 3, -12, 1.8, 1.8, '#ffffff');

  return publish(scene, key, canvas);
}
