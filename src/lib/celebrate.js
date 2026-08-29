/* The reward for getting something right. */

import Phaser from 'phaser';
import { COLORS } from './theme.js';

const CONFETTI = [0xffc93c, 0xff6b6b, 0x4ecdc4, 0x9b5fc9, 0x63b04b, 0xff9f45];

/* One texture for every piece of paper in the app. */
const PIECE = 'celebrate:piece';
const DOT = 'celebrate:dot';

function ensurePieces(scene) {
  if (!scene.textures.exists(PIECE)) {
    const canvas = scene.textures.createCanvas(PIECE, 16, 12);
    const ctx = canvas.context;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, 16, 12);
    canvas.refresh();
  }
  if (!scene.textures.exists(DOT)) {
    const canvas = scene.textures.createCanvas(DOT, 16, 16);
    const ctx = canvas.context;
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(8, 8, 8, 0, Math.PI * 2);
    ctx.fill();
    canvas.refresh();
  }
}

/* One piece of paper: a tinted image, so the whole burst is one draw call. */
function piece(scene, round, colour, size, depth) {
  return scene.add
    .image(0, 0, round ? DOT : PIECE)
    .setDisplaySize(size, round ? size : size * 0.7)
    .setTint(colour)
    .setDepth(depth);
}

/** Confetti burst.
 * @param {Phaser.Scene} scene
 * @param {number} x
 * @param {number} y
 * @param {{count?: number, spread?: number, depth?: number}} [options]
 */
export function confetti(scene, x, y, options = {}) {
  const { count = 22, spread = 200, depth = 50 } = options;

  ensurePieces(scene);

  for (let i = 0; i < count; i++) {
    // A mix of squares and circles reads as paper rather than as bubbles.
    const bit = piece(
      scene,
      i % 3 === 0,
      CONFETTI[i % CONFETTI.length],
      Phaser.Math.Between(7, 14),
      depth
    );
    bit.setPosition(x, y);

    const angle = Phaser.Math.FloatBetween(-Math.PI, 0) + Phaser.Math.FloatBetween(-0.3, 0.3);
    const distance = Phaser.Math.Between(spread * 0.4, spread);

    scene.tweens.add({
      targets: bit,
      x: x + Math.cos(angle) * distance,
      // Falls below where it was thrown, so the burst has gravity to it instead of expanding like a ring.
      y: y + Math.sin(angle) * distance + Phaser.Math.Between(60, 190),
      rotation: Phaser.Math.FloatBetween(-6, 6),
      alpha: 0,
      duration: Phaser.Math.Between(700, 1150),
      ease: 'Quad.easeIn',
      onComplete: () => bit.destroy(),
    });
  }
}

/* A star that pops out of the answer and flies to the score. */
export function flyStar(scene, from, to, onArrive) {
  const star = scene.add
    .text(from.x, from.y, '★', { fontSize: '64px', color: COLORS.accentCss })
    .setOrigin(0.5)
    .setDepth(60);

  scene.tweens.add({
    targets: star,
    scale: { from: 0.2, to: 1.15 },
    duration: 260,
    ease: 'Back.easeOut',
    onComplete: () => {
      scene.tweens.add({
        targets: star,
        x: to.x,
        y: to.y,
        scale: 0.42,
        duration: 460,
        ease: 'Cubic.easeIn',
        onComplete: () => {
          star.destroy();
          onArrive?.();
        },
      });
    },
  });
}

/* Paper falling across the whole screen, for finishing something. */
export function paperFall(scene, options = {}) {
  const { count = 44, duration = 2600, depth = 70 } = options;
  const { width, height } = scene.scale.gameSize;

  ensurePieces(scene);

  for (let i = 0; i < count; i++) {
    const bit = piece(
      scene,
      i % 4 === 0,
      CONFETTI[i % CONFETTI.length],
      Phaser.Math.Between(10, 18),
      depth
    );
    const x = Phaser.Math.Between(0, width);
    bit.setPosition(x, Phaser.Math.Between(-260, -20));

    // Drift sideways on its own timing, so pieces separate on the way down instead of falling as a sheet.
    const drift = scene.tweens.add({
      targets: bit,
      x: x + Phaser.Math.Between(-90, 90),
      duration: Phaser.Math.Between(900, 1500),
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });

    scene.tweens.add({
      targets: bit,
      y: height + 40,
      rotation: Phaser.Math.FloatBetween(-9, 9),
      duration: Phaser.Math.Between(duration * 0.6, duration),
      ease: 'Sine.easeIn',
      onComplete: () => {
        drift.stop();
        bit.destroy();
      },
    });
  }
}

/* The wiggle a letter does when it has been got right. */
export function dance(scene, target, options = {}) {
  const { scale = target.scale ?? 1 } = options;
  scene.tweens.add({
    targets: target,
    angle: { from: -8, to: 8 },
    duration: 150,
    yoyo: true,
    repeat: 3,
    ease: 'Sine.easeInOut',
    onComplete: () => target.setAngle?.(0),
  });
  scene.tweens.add({
    targets: target,
    scale: scale * 1.14,
    duration: 300,
    yoyo: true,
    repeat: 1,
    ease: 'Sine.easeInOut',
  });
}

