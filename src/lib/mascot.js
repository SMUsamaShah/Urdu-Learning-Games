/* The spider who stands on every screen. */

const BASE = import.meta.env.BASE_URL ?? '/';

/** @type {const} */
const POSES = ['idle', 'point', 'cheer', 'blink'];

/* How tall the sprite is drawn when nobody asks for a size. */
const DEFAULT_HEIGHT = 230;

const textureKey = (pose) => `mascot:${pose}`;

/* Queues the mascot's art. */
export function queueMascot(scene) {
  for (const pose of POSES) {
    const key = textureKey(pose);
    if (scene.textures.exists(key)) continue;
    scene.load.image(key, `${BASE}images/mascot/${pose}.webp`);
  }
}

/* Whether the art actually loaded. */
function available(scene) {
  return POSES.every((pose) => scene.textures.exists(textureKey(pose)));
}

/* A stand-in with the same methods, for when the art is missing. */
function noMascot(scene, x, y) {
  const empty = scene.add.container(x, y);
  empty.idle = () => {};
  empty.point = () => {};
  empty.cheer = () => {};
  empty.wonder = () => {};
  return empty;
}

/** Adds the spider to a scene.
 * @param {Phaser.Scene} scene
 * @param {number} x
 * @param {number} y the ground it stands on, not its centre.
 * @param {{height?: number, depth?: number}} [options]
 */
export function addMascot(scene, x, y, options = {}) {
  const { height = DEFAULT_HEIGHT, depth = 4 } = options;
  if (!available(scene)) {
    console.warn('mascot: art not loaded; call queueMascot() in preload()');
    return noMascot(scene, x, y);
  }

  const root = scene.add.container(x, y).setDepth(depth);

  // Origin at the bottom centre.
  const sprites = Object.fromEntries(
    POSES.map((pose) => {
      const sprite = scene.add.image(0, 0, textureKey(pose));
      sprite.setOrigin(0.5, 1).setDisplaySize(height, height).setVisible(false);
      root.add(sprite);
      return [pose, sprite];
    })
  );

  let current = 'idle';
  const show = (pose) => {
    sprites[current].setVisible(false);
    sprites[pose].setVisible(true);
    current = pose;
  };
  show('idle');

  /* Tweens owned by the current pose, stopped when the next one starts. */
  let poseTweens = [];
  const own = (tween) => {
    poseTweens.push(tween);
    return tween;
  };
  const clearPose = () => {
    for (const tween of poseTweens) tween.stop();
    poseTweens = [];
    root.setScale(1);
    root.setAngle(0);
    root.y = y;
  };

  /* Blinking is a pose swap for a tenth of a second. */
  const blinkTimer = scene.time.addEvent({
    delay: 3400,
    loop: true,
    callback: () => {
      if (current !== 'idle') return;
      show('blink');
      scene.time.delayedCall(130, () => {
        if (current === 'blink') show('idle');
      });
    },
  });

  /* A slow breath. */
  const breathe = (amount = 0.03, duration = 1500) =>
    own(
      scene.tweens.add({
        targets: root,
        scaleY: 1 + amount,
        scaleX: 1 - amount * 0.5,
        duration,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.easeInOut',
      })
    );

  /* Standing about. */
  root.idle = () => {
    clearPose();
    show('idle');
    breathe();
  };

  /* An arm out towards the answers. */
  root.point = () => {
    clearPose();
    show('point');
    breathe(0.02, 900);
  };

  /* Both arms up and a hop. */
  root.cheer = () => {
    clearPose();
    show('cheer');
    own(
      scene.tweens.add({
        targets: root,
        y: y - height * 0.14,
        duration: 260,
        yoyo: true,
        repeat: 2,
        ease: 'Quad.easeOut',
      })
    );
    own(
      scene.tweens.add({
        targets: root,
        angle: { from: -5, to: 5 },
        duration: 260,
        yoyo: true,
        repeat: 4,
        ease: 'Sine.easeInOut',
        onComplete: () => root.idle(),
      })
    );
  };

  /* A puzzled wobble. */
  root.wonder = () => {
    scene.tweens.add({
      targets: root,
      angle: { from: -9, to: 9 },
      duration: 150,
      yoyo: true,
      repeat: 2,
      ease: 'Sine.easeInOut',
      onComplete: () => root.setAngle(0),
    });
  };

  scene.events.once('shutdown', () => {
    blinkTimer.remove();
    clearPose();
  });

  root.idle();
  return root;
}

/* The spider at the size and spot every game screen puts it. */
export function addStageMascot(scene, options = {}) {
  return addMascot(scene, 122, 664, { height: 236, ...options });
}
