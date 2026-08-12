/**
 * The small movements that keep a screen from looking switched off.
 *
 * A menu of eight perfectly still tiles reads as a settings page. The same
 * eight tiles breathing very slightly out of step with each other read as
 * things waiting to be tapped, and that is most of the difference between this
 * app and the ones it is being measured against. None of it is animation in the
 * sense of a character doing something — it is one or two pixels of movement
 * that you notice only when it is missing.
 *
 * Two rules everything here follows:
 *
 *   - **Out of phase.** Anything applied to a row gets a per-item delay. Eight
 *     tiles bobbing in unison is a machine; eight tiles bobbing at slightly
 *     different times is a group of separate things.
 *   - **Small and slow.** Big idle movement is worse than none: it drags the eye
 *     away from whatever the child is supposed to be looking at, and after
 *     thirty seconds it is simply irritating.
 *
 * These are tweens on transform properties, which cost the tween manager a few
 * additions a frame and cost the renderer nothing — unlike a Graphics object,
 * which re-tessellates whatever it happens to be doing. See theme.js.
 */

/**
 * Rocks something gently up and down, for ever.
 *
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

/**
 * The scale a target is currently at, as a pair.
 *
 * Never `target.scale`. That getter returns the *average* of scaleX and scaleY,
 * and `setScale(n)` then writes that average to both — so any animation that
 * round-trips through it silently squares up whatever it touched. Every picture
 * in this app is sized with setDisplaySize and is not square, so the bug is one
 * tap away on the word plate, the counting objects and the memory cards: they
 * come back from a hop very slightly the wrong shape, and again on the next tap,
 * and again.
 */
function scaleOf(target) {
  return { x: target.scaleX ?? 1, y: target.scaleY ?? 1 };
}

/**
 * Swells and shrinks by a hair, for ever. For anything that should look alive
 * without moving off its mark — a tile in a grid, a card in a line-up.
 *
 * Scaled from whatever the target is at rather than from 1, so it composes with
 * a caller that has already sized it.
 */
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

/** Tips slowly one way and back, for ever. */
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

/**
 * Arrives with a bounce, from nothing.
 *
 * Not quite from nothing: from a fifth of full size. A container scaled to zero
 * has no hit area, and a child who taps the instant they see something must
 * never be ignored — the tap that does nothing is indistinguishable from a
 * broken app when you are three.
 *
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

/**
 * Squashes and springs back, for the moment something is tapped.
 *
 * The single highest-value animation in the app. A tap that produces no
 * movement feels broken however correct the app's response is, and this happens
 * on the pointer event itself rather than after whatever the tap triggers, so it
 * lands within a frame of the finger.
 */
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

/**
 * A quick shimmy, for a letter that has just been got right.
 *
 * Rotation rather than position: the letter has to stay where it was recognised
 * or the eye loses it, and a letter that wanders off its mark at the moment of
 * success is the thing that makes an app feel loose.
 */
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

/**
 * A hop: up, and down with a squash on landing.
 *
 * What a letter does when it is pleased with itself. Built as a chain rather
 * than one tween because the landing has to be sharper than the take-off —
 * equal timings read as a float rather than a jump, and the squash at the
 * bottom is what sells the weight.
 */
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

/**
 * Gives a row of things the same idle animation, out of phase.
 *
 * The delay is spread across one full cycle rather than being a fixed step, so
 * the row never re-synchronises however many items are in it. A fixed step
 * eventually lines them all up again, and a menu that periodically pulses in
 * unison looks like a fault.
 *
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
