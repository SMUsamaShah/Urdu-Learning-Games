/* The small movements that keep a screen from looking switched off. */

/** Rocks something gently up and down, for ever.
 * @param {Phaser.Scene} scene
 * @param {Phaser.GameObjects.GameObject} target
 * @param {object} [options]
 * @param {number} [options.distance=5] pixels, peak to centre
 * @param {number} [options.duration=1600]
 * @param {number} [options.delay=0] use to put a row out of phase
 */
export function bob(scene, target, options = {}) {
  const { distance = 5, duration = 1600, delay = 0 } = options;
  return scene.tweens.add({
    targets: target,
    y: target.y - distance,
    duration,
    delay,
    yoyo: true,
    repeat: -1,
    ease: 'Sine.easeInOut',
  });
}

/* The scale a target is currently at, as a pair. */
function scaleOf(target) {
  return { x: target.scaleX ?? 1, y: target.scaleY ?? 1 };
}

/* Swells and shrinks by a hair, for ever. */
export function breathe(scene, target, options = {}) {
  const { amount = 0.03, duration = 1900, delay = 0 } = options;
  const base = scaleOf(target);
  return scene.tweens.add({
    targets: target,
    scaleX: base.x * (1 + amount),
    scaleY: base.y * (1 + amount),
    duration,
    delay,
    yoyo: true,
    repeat: -1,
    ease: 'Sine.easeInOut',
  });
}

/* Tips slowly one way and back, for ever. */
export function sway(scene, target, options = {}) {
  const { angle = 3, duration = 2100, delay = 0 } = options;
  const base = target.angle ?? 0;
  return scene.tweens.add({
    targets: target,
    angle: base + angle,
    duration,
    delay,
    yoyo: true,
    repeat: -1,
    ease: 'Sine.easeInOut',
  });
}

/** Arrives with a bounce, from nothing.
 * @returns {Phaser.Tweens.Tween}
 */
export function popIn(scene, target, options = {}) {
  const { delay = 0, duration = 380, from = 0.2 } = options;
  const base = scaleOf(target);
  target.setScale(base.x * from, base.y * from);
  return scene.tweens.add({
    targets: target,
    scaleX: base.x,
    scaleY: base.y,
    delay,
    duration,
    ease: 'Back.easeOut',
  });
}

/* Squashes and springs back, for the moment something is tapped. */
export function squash(scene, target, options = {}) {
  const { amount = 0.12, duration = 90 } = options;
  const base = scaleOf(target);
  scene.tweens.killTweensOf(target);
  return scene.tweens.add({
    targets: target,
    scaleX: base.x * (1 + amount),
    scaleY: base.y * (1 - amount),
    duration,
    yoyo: true,
    ease: 'Quad.easeOut',
    onComplete: () => target.setScale(base.x, base.y),
  });
}

/* A quick shimmy, for a letter that has just been got right. */
export function jig(scene, target, options = {}) {
  const { angle = 9, duration = 110, repeats = 3 } = options;
  const base = target.angle ?? 0;
  return scene.tweens.add({
    targets: target,
    angle: base + angle,
    duration,
    yoyo: true,
    repeat: repeats,
    ease: 'Sine.easeInOut',
    onComplete: () => target.setAngle(base),
  });
}

/* A hop: up, and down with a squash on landing. */
export function hop(scene, target, options = {}) {
  const { height = 26, duration = 260 } = options;
  const baseY = target.y;
  const base = scaleOf(target);
  scene.tweens.chain({
    targets: target,
    tweens: [
      { y: baseY - height, duration, ease: 'Sine.easeOut' },
      { y: baseY, duration: duration * 0.7, ease: 'Quad.easeIn' },
      {
        scaleX: base.x * 1.14,
        scaleY: base.y * 0.86,
        duration: 70,
        yoyo: true,
        ease: 'Quad.easeOut',
      },
    ],
    onComplete: () => {
      target.setScale(base.x, base.y);
      target.y = baseY;
    },
  });
}

/** Gives a row of things the same idle animation, out of phase.
 * @param {Phaser.Scene} scene
 * @param {Phaser.GameObjects.GameObject[]} targets
 * @param {(scene: any, target: any, options: object) => any} animation
 */
export function stagger(scene, targets, animation, options = {}) {
  const { duration = 1900 } = options;
  return targets.map((target, index) =>
    animation(scene, target, {
      ...options,
      duration,
      delay: (index / Math.max(1, targets.length)) * duration,
    })
  );
}
