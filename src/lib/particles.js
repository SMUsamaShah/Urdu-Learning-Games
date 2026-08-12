/**
 * Sparks, puffs and sparkle trails.
 *
 * The difference between an app a three-year-old plays once and one they ask
 * for is almost entirely in what happens *at the moment of the tap*. A correct
 * answer that simply becomes correct is information; a correct answer that
 * bursts is a reason to find another one. Every reference app leans on this
 * heavily, and it is the cheapest fun in the whole project.
 *
 * ## Why particles rather than more tweened images
 *
 * `celebrate.js` throws confetti by tweening a few dozen Images, which is right
 * for confetti: each piece needs its own arc, its own tumble and its own
 * landing. It is the wrong tool for a burst of forty sparks that all do the
 * same thing, because forty tweens is forty objects the tween manager has to
 * step every frame for half a second.
 *
 * Phaser's emitter holds one game object however many particles are alive, and
 * everything sharing a texture draws in a single batched call. So: emitters for
 * anything where the particles are interchangeable, tweens for anything with a
 * choreography.
 *
 * ## Textures
 *
 * Three, baked once into canvas textures and tinted at use. All of them are
 * soft-edged — a hard-edged spark reads as a bug at small sizes, and these are
 * mostly seen at eight or ten pixels across.
 */

import Phaser from 'phaser';

const SPARK = 'fx:spark';
const STAR = 'fx:star';
const PUFF = 'fx:puff';

/** A radial gradient from opaque white to nothing. */
function drawSoftDot(ctx, size) {
  const r = size / 2;
  const gradient = ctx.createRadialGradient(r, r, 0, r, r, r);
  gradient.addColorStop(0, 'rgba(255,255,255,1)');
  gradient.addColorStop(0.45, 'rgba(255,255,255,0.85)');
  gradient.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);
}

/**
 * A four-pointed sparkle: two crossed tapered spikes.
 *
 * Not a five-pointed star. At the size these are drawn a five-pointed star is
 * an indistinct blob, whereas the crossed spikes still read as *a glint* even
 * when they are six pixels across, which is the whole job.
 */
function drawSparkle(ctx, size) {
  const c = size / 2;
  const long = c * 0.95;
  const waist = c * 0.14;
  ctx.fillStyle = '#ffffff';
  for (const rotation of [0, Math.PI / 2]) {
    ctx.save();
    ctx.translate(c, c);
    ctx.rotate(rotation);
    ctx.beginPath();
    ctx.moveTo(0, -long);
    ctx.quadraticCurveTo(waist, -waist, long, 0);
    ctx.quadraticCurveTo(waist, waist, 0, long);
    ctx.quadraticCurveTo(-waist, waist, -long, 0);
    ctx.quadraticCurveTo(-waist, -waist, 0, -long);
    ctx.fill();
    ctx.restore();
  }
  // A soft halo, so it glows rather than being a flat shape.
  ctx.globalAlpha = 0.5;
  drawSoftDot(ctx, size);
  ctx.globalAlpha = 1;
}

function ensureTextures(scene) {
  const make = (key, size, draw) => {
    if (scene.textures.exists(key)) return;
    const canvas = scene.textures.createCanvas(key, size, size);
    draw(canvas.context, size);
    canvas.refresh();
  };
  make(SPARK, 32, drawSoftDot);
  make(STAR, 48, drawSparkle);
  make(PUFF, 48, (ctx, size) => {
    ctx.globalAlpha = 0.8;
    drawSoftDot(ctx, size);
  });
}

/**
 * Runs an emitter once and takes it away afterwards.
 *
 * One-shot bursts are the common case here and a leaked emitter is a silent
 * cost: it stays on the display list, keeps being stepped, and there is nothing
 * on screen to show for it. The lifespan plus a beat is when the last particle
 * can possibly still be alive.
 */
function burst(scene, emitter, count, lifespan) {
  emitter.explode(count);
  scene.time.delayedCall(lifespan + 200, () => emitter.destroy());
  return emitter;
}

/** The app's own palette, so a burst belongs to the same picture as the tiles. */
const HAPPY = [0xffc93c, 0xff6b6b, 0x4ecdc4, 0x9b5fc9, 0x63b04b, 0xffffff];

/**
 * A burst of sparkles at a point. The reward for one right answer.
 *
 * @param {Phaser.Scene} scene
 * @param {number} x
 * @param {number} y
 * @param {object} [options]
 * @param {number} [options.count=26]
 * @param {number[]} [options.tint] colours to pick from
 * @param {number} [options.speed=260] how far they fly
 * @param {number} [options.depth=30]
 */
export function sparkleBurst(scene, x, y, options = {}) {
  ensureTextures(scene);
  const { count = 26, tint = HAPPY, speed = 260, depth = 30 } = options;
  const lifespan = 700;

  const emitter = scene.add.particles(x, y, STAR, {
    lifespan,
    speed: { min: speed * 0.35, max: speed },
    angle: { min: 0, max: 360 },
    // Thrown outwards and then slowed, so they burst rather than drift.
    scale: { start: 0.5, end: 0 },
    alpha: { start: 1, end: 0.2 },
    rotate: { min: -180, max: 180 },
    gravityY: 220,
    tint,
    emitting: false,
  });
  emitter.setDepth(depth);
  return burst(scene, emitter, count, lifespan);
}

/**
 * The puff a balloon leaves behind.
 *
 * Coloured like the balloon that burst, which is what connects the effect to
 * the thing that popped — a generic white puff reads as unrelated weather.
 */
export function popPuff(scene, x, y, tint) {
  ensureTextures(scene);
  const lifespan = 420;
  const emitter = scene.add.particles(x, y, PUFF, {
    lifespan,
    speed: { min: 90, max: 320 },
    angle: { min: 0, max: 360 },
    scale: { start: 0.55, end: 0 },
    alpha: { start: 0.9, end: 0 },
    tint: [tint, 0xffffff],
    emitting: false,
  });
  emitter.setDepth(12);
  return burst(scene, emitter, 18, lifespan);
}

/**
 * A ring of sparks travelling outwards, for something appearing.
 *
 * Distinct from `sparkleBurst` on purpose: a ring reads as "here it is" and a
 * scatter reads as "well done". Using the same effect for both makes arriving
 * feel like winning, and then winning feels like nothing.
 */
export function ringBurst(scene, x, y, tint = 0xffffff) {
  ensureTextures(scene);
  const lifespan = 520;
  const emitter = scene.add.particles(x, y, SPARK, {
    lifespan,
    speed: 240,
    angle: { min: 0, max: 360 },
    scale: { start: 0.4, end: 0 },
    alpha: { start: 0.9, end: 0 },
    tint,
    emitting: false,
  });
  emitter.setDepth(20);
  return burst(scene, emitter, 20, lifespan);
}

/**
 * Sparkles drifting down the whole screen, for finishing something.
 *
 * The screen-wide counterpart to `sparkleBurst`, and kept for milestones for
 * the same reason `paperFall` is: an effect that happens every time is not a
 * reward, it is a background.
 */
export function starShower(scene, options = {}) {
  ensureTextures(scene);
  const { duration = 2200, depth = 40 } = options;
  const width = scene.scale.width;

  const emitter = scene.add.particles(0, -30, STAR, {
    x: { min: 0, max: width },
    lifespan: 2600,
    speedY: { min: 90, max: 220 },
    speedX: { min: -40, max: 40 },
    scale: { start: 0.45, end: 0.1 },
    alpha: { start: 1, end: 0.3 },
    rotate: { min: -120, max: 120 },
    tint: HAPPY,
    frequency: 40,
  });
  emitter.setDepth(depth);

  scene.time.delayedCall(duration, () => {
    emitter.stop();
    scene.time.delayedCall(2800, () => emitter.destroy());
  });
  return emitter;
}

/**
 * A sparkle trail that follows something, for a finger drawing a letter.
 *
 * Returned rather than self-destructing, because the caller decides when the
 * drawing stops. Whoever creates one owns stopping it.
 */
export function sparkleTrail(scene, options = {}) {
  ensureTextures(scene);
  const { tint = 0xffe08a, depth = 25 } = options;
  const emitter = scene.add.particles(0, 0, SPARK, {
    lifespan: 420,
    speed: { min: 10, max: 60 },
    angle: { min: 0, max: 360 },
    scale: { start: 0.35, end: 0 },
    alpha: { start: 0.8, end: 0 },
    tint,
    frequency: 26,
    emitting: false,
  });
  emitter.setDepth(depth);
  return emitter;
}
