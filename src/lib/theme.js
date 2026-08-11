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
  correct: 0x2fae74,
  gentle: 0xef6c4d,
  /** Shadow under a card. Softer than on a dark background, or it looks dirty. */
  shadow: 0x8a7a63,
};

/** One hue per shape family, so a family reads as a group at a glance. */
export const FAMILY_COLORS = {
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
 * A large, rounded, tappable button with a press animation.
 *
 * Deliberately has no fail or disabled state: in a preschool app every tap
 * should do something, so buttons that are not ready simply are not shown.
 *
 * @param {Phaser.Scene} scene
 * @param {object} config
 * @param {number} config.x
 * @param {number} config.y
 * @param {number} config.width
 * @param {number} config.height
 * @param {number} [config.color]
 * @param {() => void} config.onTap
 * @returns {Phaser.GameObjects.Container}
 */
export function makeButton(scene, config) {
  const { x, y, width, height, color = COLORS.panel, onTap } = config;
  const container = scene.add.container(x, y);

  const shadow = scene.add.graphics();
  shadow.fillStyle(COLORS.shadow, 0.22);
  shadow.fillRoundedRect(-width / 2, -height / 2 + 8, width, height, 26);

  const face = scene.add.graphics();
  face.fillStyle(color, 1);
  face.fillRoundedRect(-width / 2, -height / 2, width, height, 26);

  container.add([shadow, face]);
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
