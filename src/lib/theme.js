/**
 * Shared look and feel.
 *
 * Design targets a three-year-old holding a phone in landscape: nothing smaller
 * than a fingertip, high contrast against the background, and no reliance on
 * reading Latin text to navigate.
 */

/** Design resolution. Everything is laid out against this and scaled to fit. */
export const DESIGN = { width: 1280, height: 720 };

/**
 * The strip down the left of every game screen, which belongs to progress.
 *
 * One number, here, because every game already reserved roughly this much on
 * the left for the character and each of them had picked its own figure — 250,
 * 268, 280, 300, 320, 330. Those were all guesses at the same thing, so they
 * now read `RAIL.width + something` and the width can move without twenty-four
 * separate corrections.
 *
 * `gap` is the clear space a game leaves between the rail and its own content:
 * nothing the child taps should touch the panel.
 */
export const RAIL = { width: 200, gap: 56 };

/** The first x a game may use. */
export const RAIL_EDGE = RAIL.width + RAIL.gap;

/**
 * A bright palette, because the audience is three.
 *
 * Two surfaces, and which one something sits on decides its colour:
 *
 *   - **Paper** (`bg`, `card`): warm and light. Anything drawn here uses `ink`
 *     or `inkDim`, which are dark.
 *   - **Colour** (the family hues, the menu tiles, a balloon): saturated enough
 *     that `onColor` — white — stays legible on top of it. The hues below are
 *     deliberately mid-tone rather than pastel for that reason: a pale tile on
 *     pale paper has no edge, and white on a pale tile cannot be read.
 *
 * Getting this backwards is the easiest mistake to make here, so the two ink
 * colours are named for where they go rather than for what they look like.
 */
export const COLORS = {
  bg: 0xfdf3e3,
  bgCss: '#fdf3e3',
  /** Cards and plates sitting on the paper. */
  card: 0xffffff,
  panel: 0xffffff,
  panelLight: 0xffffff,
  /** On paper and on cards. */
  ink: '#2b3047',
  inkDim: '#767f9c',
  /** On a saturated tile, balloon or button. */
  onColor: '#ffffff',
  onColorDim: '#f0eef8',
  accent: 0xe98a1f,
  accentCss: '#e98a1f',
  /**
   * The letter being taught, wherever it appears on the Letters screen — the
   * big one, the form it is in, and the same letter inside the word.
   *
   * Purple, and not the orange accent: the accent is a button colour and this
   * has to be read as "this is the same thing" rather than "tap this". Not
   * `familyColor` either, which already means "these share a shape".
   */
  taught: 0x8b3ed6,
  taughtCss: '#8b3ed6',
  correct: 0x2fae74,
  gentle: 0xef6c4d,
  /** Shadow under a card. Softer than on a dark background, or it looks dirty. */
  shadow: 0x8a7a63,
  /** The dark line around cards and letters. Not pure black — that reads cheap. */
  outline: 0x2b3047,
  outlineCss: '#2b3047',
};

/**
 * How heavy the outline is, as a fraction of the font's em.
 *
 * Not a number of pixels, and that distinction is the whole point. A glyph's
 * display height says nothing about how thick its strokes are: گنتی has a deep
 * descender on its ی, so fitting it into a 44px label scales it down about ten
 * times harder than a bare ب at the same height. A line specified in pixels
 * then lands ten times heavier on it — measured at 103‰ of the em against 32‰
 * for the ب — which is why the word read as fuzzy black rather than as white
 * with an edge.
 *
 * In em units every glyph gets the same outline relative to the pen that drew
 * it, whatever box it was squeezed into.
 */
const OUTLINE_EM = 0.032;

/**
 * Glyph options that give a letter the heavy outline preschool apps use.
 *
 * The outline is not decoration: a white letter on a mid-tone tile has weak
 * edges, and a child picking between ب and ت is working entirely from edges.
 *
 * Sized by the font's em rather than by the glyph's bounding box, because
 * everything wearing this outline sits next to something else — a row of menu
 * tiles, four answers, a caterpillar — and has to come out the same size as its
 * neighbours rather than filling the same box. See fitEmAlone() in glyph.js.
 *
 * @param {number} em pixels per em, normally from one of the fitters
 * @param {string} [fill]
 */
export function chunkyGlyphEm(em, fill = '#ffffff') {
  return { em, color: fill, stroke: COLORS.outlineCss, strokeEm: OUTLINE_EM };
}

/** One hue per shape family, so a family reads as a group at a glance. */
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

/**
 * The outline of a star, as points on an ellipse rather than a circle.
 *
 * Elliptical because the things that go inside these are Urdu letters, and Urdu
 * has letters several times wider than they are tall. A round star sized to fit
 * ے across its middle would be enormous; a wide one is the same star, stretched
 * to the shape of its contents.
 *
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

/**
 * A scalloped sticker outline: a rounded shape with a bumpy edge.
 *
 * The alternative playful shape to a star, and the one the letter games use.
 * A five-pointed star is thin across its middle, so an Urdu letter placed in
 * one has to shrink a long way to fit between the notches — and letter
 * legibility is the entire point of those games. A scallop keeps nearly all of
 * the area while still being obviously not a rectangle.
 */
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

/** Points scaled towards the centre, for drawing the inner rim. */
function shrink(points, factor) {
  return points.map((p) => ({ x: p.x * factor, y: p.y * factor }));
}

/** `0x8a7a63` as a canvas colour. */
function css(hex, alpha = 1) {
  const value = `#${hex.toString(16).padStart(6, '0')}`;
  if (alpha >= 1) return value;
  const [r, g, b] = [16, 8, 0].map((shift) => (hex >> shift) & 0xff);
  return `rgba(${r},${g},${b},${alpha})`;
}

/** Rounded rectangle, with a hand-rolled path where `roundRect` is missing. */
function roundedRect(ctx, x, y, width, height, radius) {
  ctx.beginPath();
  if (ctx.roundRect) {
    ctx.roundRect(x, y, width, height, radius);
    return;
  }
  // Safari before 16.4, which is exactly the hand-me-down tablet this app is
  // most likely to be played on.
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

/**
 * Rendering at twice the drawn size. Two rather than the three glyph.js uses:
 * these are flat shapes with one curve radius, not Nastaliq strokes a pixel
 * wide, and a menu of ten tiles at 3x is four times the texture memory for an
 * edge nobody can see.
 */
const CARD_SUPERSAMPLE = 2;
/** Room around the shape for the shadow (8px down) and the outer rim stroke. */
const CARD_PAD = 14;

/**
 * Bakes a button's card — shadow, face and rim — into one cached texture.
 *
 * ## Why this is not three Graphics objects
 *
 * It was, and it cost the menu a third of its frame rate. A Phaser Graphics
 * object re-tessellates its whole path on every frame it is visible, whether or
 * not anything about it changed, so ten menu tiles with a shadow, a face and a
 * caption band each were thirty full retessellations per frame for a picture
 * that had not moved since the scene opened. Measured on the menu: 12.3fps with
 * them, 19.7 without the tile grid at all.
 *
 * A card is completely determined by its size, colour, shape and whether it has
 * a rim, so that tuple is the cache key and buttons that look alike share one
 * texture. The 24 game screens get this for free — every home button, every
 * answer tile and every balloon is a `makeButton`.
 *
 * @returns {string} texture key
 */
function cardTexture(scene, { width, height, color, shape, rim, paint, paintKey }) {
  // The painter's name leads, so a baked face still announces its role and its
  // em the way a glyph texture does. verify:sizing walks texture keys to check
  // that one role is never drawn at two sizes, and a tile whose writing is
  // inside a card texture would otherwise drop out of that check entirely.
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

  // Anything the caller wants on the face, drawn into the same texture rather
  // than stacked on top as more quads. The origin is the shape's centre and the
  // scale is 1:1 in game pixels, so a painter positions things exactly as it
  // would position child objects.
  paint?.(ctx, { width, height });

  const texture = scene.textures.createCanvas(key, canvas.width, canvas.height);
  texture.context.drawImage(canvas, 0, 0);
  texture.refresh();
  return key;
}

/**
 * A large, tappable button with a press animation.
 *
 * Deliberately has no fail or disabled state: in a preschool app every tap
 * should do something, so buttons that are not ready simply are not shown.
 *
 * The hit area is the bounding box whatever the shape. That is deliberate for a
 * star: the notches between its arms are exactly where a three-year-old's
 * finger lands, and a tap that does nothing because it missed by 8px reads as a
 * broken game rather than a near miss.
 *
 * @param {Phaser.Scene} scene
 * @param {object} config
 * @param {number} config.x
 * @param {number} config.y
 * @param {number} config.width
 * @param {number} config.height
 * @param {number} [config.color]
 * @param {'card'|'star'|'blob'|'circle'} [config.shape='card']
 * @param {boolean} [config.rim=true] The white-and-dark sticker edge. Off for
 *   the small chrome buttons, where it is just noise.
 * @param {() => void} config.onTap
 * @param {(ctx: CanvasRenderingContext2D, size: object) => void} [config.paint]
 *   Draws the button's contents into the card texture instead of adding them as
 *   children. For a face that never changes this is one quad and one texture
 *   rather than several of each; the menu's tiles are built this way.
 * @param {string} [config.paintKey] Identifies what `paint` will draw, so two
 *   buttons that paint differently do not share a cached texture. Required
 *   whenever `paint` is given.
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
  } = config;
  const container = scene.add.container(x, y);

  // One baked image rather than a shadow Graphics and a face Graphics. See
  // cardTexture: the shapes never change after the scene opens, and a Graphics
  // re-tessellates every frame regardless.
  const card = scene.add
    .image(0, 0, cardTexture(scene, { width, height, color, shape, rim, paint, paintKey }))
    .setScale(1 / CARD_SUPERSAMPLE);

  container.add(card);
  container.card = card;
  container.setSize(width, height);
  container.setInteractive({ useHandCursor: true });

  const press = (scale) =>
    scene.tweens.add({ targets: container, scale, duration: 90, ease: 'Quad.easeOut' });

  container.on('pointerdown', () => press(0.94));
  container.on('pointerout', () => press(1));
  container.on('pointerup', () => {
    press(1);
    onTap?.();
  });

  return container;
}

/**
 * Latin helper text. Urdu never goes through this — see src/lib/glyph.js for
 * why. This is only for romanisation and English glosses, which exist for the
 * parent, not the child.
 */
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
