/**
 * Shared look and feel.
 *
 * Design targets a three-year-old holding a phone in landscape: nothing smaller
 * than a fingertip, high contrast against the background, and no reliance on
 * reading Latin text to navigate.
 */

/** Design resolution. Everything is laid out against this and scaled to fit. */
export const DESIGN = { width: 1280, height: 720 };

export const COLORS = {
  bg: 0x1b2440,
  bgCss: '#1b2440',
  panel: 0x27335c,
  panelLight: 0x33416f,
  ink: '#ffffff',
  inkDim: '#9aa6c7',
  accent: 0xffc857,
  accentCss: '#ffc857',
  correct: 0x5ad19b,
  gentle: 0xef8a6a,
};

/** One hue per shape family, so a family reads as a group at a glance. */
export const FAMILY_COLORS = {
  alif: 0xef8a6a, be: 0x63b3ed, jim: 0x9f7aea, dal: 0x68d391,
  re: 0xf6ad55, sin: 0x4fd1c5, suad: 0xfc8181, toe: 0x76a9fa,
  ain: 0xd6bcfa, fe: 0xf687b3, qaf: 0x81e6d9, kaf: 0xfbd38d,
  lam: 0x90cdf4, mim: 0xb5f5cd, nun: 0xffa8a8, wao: 0xa3bffa,
  he: 0xfbb6ce, hamza: 0xc3dafe, ye: 0x9ae6b4,
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
  shadow.fillStyle(0x000000, 0.28);
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
