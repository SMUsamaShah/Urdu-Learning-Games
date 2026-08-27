/* Shared look and feel. */

/* Design resolution. */
export const DESIGN = { width: 1280, height: 720 };

/* How wide the canvas may get, in design pixels at 720 tall. */
const WIDTH_RANGE = { min: 1280, max: 1728 };

/** Fits the design surface to a screen of this shape.
 * @param {{width: number, height: number}} viewport in landscape CSS pixels
 */
export function setDesignSize(viewport) {
  const aspect = viewport.width / viewport.height;
  const wanted = Math.round(DESIGN.height * aspect);
  DESIGN.width = Math.min(WIDTH_RANGE.max, Math.max(WIDTH_RANGE.min, wanted));
  // PLAY is derived from it and was computed at import, so it has to be brought along by hand.
  PLAY.right = DESIGN.width;
  PLAY.width = DESIGN.width - RAIL_EDGE;
  PLAY.centerX = (RAIL_EDGE + DESIGN.width) / 2;
  return DESIGN;
}

/* The strip down the left of every game screen, which belongs to progress. */
export const RAIL = { width: 128, gap: 32 };

/* The first x a game may use. */
export const RAIL_EDGE = RAIL.width + RAIL.gap;

/* The part of the screen that belongs to the game, and its middle. */
export const PLAY = {
  left: RAIL_EDGE,
  right: DESIGN.width,
  width: DESIGN.width - RAIL_EDGE,
  centerX: (RAIL_EDGE + DESIGN.width) / 2,
};

/* A bright palette, because the audience is three. */
export const COLORS = {
  bg: 0xfdf3e3,
  bgCss: '#fdf3e3',
  /* Cards and plates sitting on the paper. */
  card: 0xffffff,
  panel: 0xffffff,
  panelLight: 0xffffff,
  /* On paper and on cards. */
  ink: '#2b3047',
  inkDim: '#767f9c',
  /* On a saturated tile, balloon or button. */
  onColor: '#ffffff',
  onColorDim: '#f0eef8',
  accent: 0xe98a1f,
  accentCss: '#e98a1f',
  /* The letter being taught. */
  taught: 0x8b3ed6,
  taughtCss: '#8b3ed6',
  correct: 0x2fae74,
  gentle: 0xef6c4d,
  /* Shadow under a card. */
  shadow: 0x8a7a63,
  /* The dark line around cards and letters. */
  outline: 0x2b3047,
  outlineCss: '#2b3047',
};

/** Glyph options for a letter that has to stand out on a coloured tile.
 * @param {number} em pixels per em, normally from one of the fitters
 * @param {string} [fill]
 */
export function chunkyGlyphEm(em, fill = '#ffffff') {
  return { em, color: fill };
}

/* One hue per shape family, so a family reads as a group at a glance. */
const FAMILY_COLORS = {
  alif: 0xe4633c, be: 0x2f86d0, jim: 0x7b52c9, dal: 0x2f9e5f,
  re: 0xe0821c, sin: 0x1a9c96, suad: 0xd94f5c, toe: 0x3f74d6,
  ain: 0x9b5fc9, fe: 0xd44f8c, qaf: 0x0f9c8c, kaf: 0xcf8a1b,
  lam: 0x3d7fc4, mim: 0x3aa06a, nun: 0xd75f5f, wao: 0x5a6bd0,
  he: 0xd45f95, hamza: 0x5a7bc4, ye: 0x479b5c,
};

export function familyColor(family) {
  return FAMILY_COLORS[family] ?? COLORS.panelLight;
}

/** The outline of a star, as points on an ellipse rather than a circle.
 * @param {number} width
 * @param {number} height
 * @param {number} [inset] how deep the notches cut, as a fraction of the radius
 */
function starPoints(width, height, inset = 0.54) {
  const points = [];
  for (let i = 0; i < 10; i++) {
    const radius = i % 2 ? inset : 1;
    const angle = -Math.PI / 2 + (i * Math.PI) / 5;
    points.push({
      x: (Math.cos(angle) * radius * width) / 2,
      y: (Math.sin(angle) * radius * height) / 2,
    });
  }
  return points;
}

/* A scalloped sticker outline: a rounded shape with a bumpy edge. */
export function blobPoints(width, height, lobes = 9, depth = 0.075) {
  const points = [];
  const steps = lobes * 10;
  for (let i = 0; i < steps; i++) {
    const angle = (i / steps) * Math.PI * 2 - Math.PI / 2;
    const radius = 1 + depth * Math.cos(angle * lobes);
    points.push({
      x: (Math.cos(angle) * radius * width) / 2,
      y: (Math.sin(angle) * radius * height) / 2,
    });
  }
  return points;
}

/* Points scaled towards the centre, for drawing the inner rim. */
function shrink(points, factor) {
  return points.map((p) => ({ x: p.x * factor, y: p.y * factor }));
}

/* `0x8a7a63` as a canvas colour. */
function css(hex, alpha = 1) {
  const value = `#${hex.toString(16).padStart(6, '0')}`;
  if (alpha >= 1) return value;
  const [r, g, b] = [16, 8, 0].map((shift) => (hex >> shift) & 0xff);
  return `rgba(${r},${g},${b},${alpha})`;
}

/* Rounded rectangle, with a hand-rolled path where `roundRect` is missing. */
function roundedRect(ctx, x, y, width, height, radius) {
  ctx.beginPath();
  if (ctx.roundRect) {
    ctx.roundRect(x, y, width, height, radius);
    return;
  }
  const r = Math.min(radius, width / 2, height / 2);
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + width, y, x + width, y + height, r);
  ctx.arcTo(x + width, y + height, x, y + height, r);
  ctx.arcTo(x, y + height, x, y, r);
  ctx.arcTo(x, y, x + width, y, r);
  ctx.closePath();
}

function polygon(ctx, points, dy = 0) {
  ctx.beginPath();
  points.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y + dy) : ctx.moveTo(p.x, p.y + dy)));
  ctx.closePath();
}

/* Rendering at twice the drawn size. */
const CARD_SUPERSAMPLE = 2;
/* Room around the shape for the shadow (8px down) and the outer rim stroke. */
const CARD_PAD = 14;

/** Bakes a button's card — shadow, face and rim — into one cached texture.
 * @returns {string} texture key
 */
function cardTexture(scene, { width, height, color, shape, rim, paint, paintKey }) {
  // The painter's name leads, so a baked face still announces its role and its em the way a glyph texture does.
  const shapeKey = `${shape}:${Math.round(width)}x${Math.round(height)}:${color}:${rim ? 1 : 0}`;
  const key = paintKey ? `${paintKey}:${shapeKey}` : `card:${shapeKey}`;
  if (scene.textures.exists(key)) return key;

  const canvas = document.createElement('canvas');
  canvas.width = Math.ceil((width + CARD_PAD * 2) * CARD_SUPERSAMPLE);
  canvas.height = Math.ceil((height + CARD_PAD * 2) * CARD_SUPERSAMPLE);
  const ctx = canvas.getContext('2d');
  ctx.scale(CARD_SUPERSAMPLE, CARD_SUPERSAMPLE);
  // Origin at the shape's centre, matching how the shapes are described.
  ctx.translate(CARD_PAD + width / 2, CARD_PAD + height / 2);

  let outline = null;
  if (shape === 'star') outline = starPoints(width, height);
  else if (shape === 'blob') outline = blobPoints(width, height);
  else if (shape === 'circle') outline = blobPoints(width, height, 4, 0);

  ctx.fillStyle = css(COLORS.shadow, 0.22);
  if (outline) polygon(ctx, outline, 8);
  else roundedRect(ctx, -width / 2, -height / 2 + 8, width, height, 26);
  ctx.fill();

  ctx.fillStyle = css(color);
  if (outline) polygon(ctx, outline);
  else roundedRect(ctx, -width / 2, -height / 2, width, height, 26);
  ctx.fill();

  if (rim) {
    ctx.lineJoin = 'round';
    ctx.strokeStyle = 'rgba(255,255,255,0.95)';
    ctx.lineWidth = 6;
    if (outline) polygon(ctx, shrink(outline, shape === 'star' ? 0.9 : 0.93));
    else roundedRect(ctx, -width / 2 + 3, -height / 2 + 3, width - 6, height - 6, 23);
    ctx.stroke();

    ctx.strokeStyle = css(COLORS.outline, 0.85);
    ctx.lineWidth = 3;
    if (outline) polygon(ctx, outline);
    else roundedRect(ctx, -width / 2, -height / 2, width, height, 26);
    ctx.stroke();
  }

  // Anything the caller wants on the face, drawn into the same texture rather than stacked on top as more quads.
  paint?.(ctx, { width, height });

  const texture = scene.textures.createCanvas(key, canvas.width, canvas.height);
  texture.context.drawImage(canvas, 0, 0);
  texture.refresh();
  return key;
}

/** A large, tappable button with a press animation.
 * @param {Phaser.Scene} scene
 * @param {object} config
 * @param {number} config.x
 * @param {number} config.y
 * @param {number} config.width
 * @param {number} config.height
 * @param {number} [config.color]
 * @param {'card'|'star'|'blob'|'circle'} [config.shape='card']
 * @param {boolean} [config.rim=true] The white-and-dark sticker edge.
 * @param {() => void} config.onTap
 * @param {(ctx: CanvasRenderingContext2D, size: object) => void} [config.paint]
 * @param {string} [config.paintKey] Cache key for custom painting.
 * @param {boolean} [config.press=true] The squash-under-the-finger tween.
 * @returns {Phaser.GameObjects.Container}
 */
export function makeButton(scene, config) {
  const {
    x,
    y,
    width,
    height,
    color = COLORS.panel,
    shape = 'card',
    rim = true,
    onTap,
    paint,
    paintKey,
    press: wantPress = true,
  } = config;
  const container = scene.add.container(x, y);

  // One baked image rather than a shadow Graphics and a face Graphics.
  const card = scene.add
    .image(0, 0, cardTexture(scene, { width, height, color, shape, rim, paint, paintKey }))
    .setScale(1 / CARD_SUPERSAMPLE);

  container.add(card);
  container.card = card;
  container.setSize(width, height);
  container.setInteractive({ useHandCursor: true });

  const press = (scale) =>
    wantPress &&
    scene.tweens.add({ targets: container, scale, duration: 90, ease: 'Quad.easeOut' });

  container.on('pointerdown', () => press(0.94));
  container.on('pointerout', () => press(1));
  container.on('pointerup', () => {
    press(1);
    onTap?.();
  });

  return container;
}

/* Latin helper text. */
export function label(scene, x, y, text, options = {}) {
  const {
    size = 22,
    color = COLORS.inkDim,
    align = 'center',
    weight = '500',
  } = options;
  return scene.add
    .text(x, y, text, {
      fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, sans-serif',
      fontSize: `${size}px`,
      fontStyle: weight,
      color,
      align,
    })
    .setOrigin(0.5);
}
