/**
 * The world the games sit in: sky, sun, clouds, hills, flowers, birds.
 *
 * A flat background is the single thing that made this app look like a tool
 * rather than a toy. Preschool apps put their games somewhere — a park, a
 * meadow — and that backdrop does most of the work of feeling playful before
 * any character or animation is involved.
 *
 * Everything here is drawn procedurally rather than loaded. That is not
 * cleverness for its own sake: the app has to work offline on a phone, and a
 * couple of hundred lines of arcs cost nothing next to a set of background
 * images at several screen sizes. It also means the scenery recolours by
 * changing numbers rather than by redrawing art.
 *
 * ## Baked, not drawn every frame
 *
 * The static half of the scene — sun, hills, ground, grass, flowers — is
 * rasterised once into a single canvas texture and then drawn as one Image.
 * This matters more than it sounds. A Phaser Graphics object re-tessellates its
 * geometry on the CPU **every frame**, whether or not anything about it has
 * changed, so the old version paid for four hundred ellipses sixty times a
 * second to show a picture that never moved. Baking makes it one texture upload
 * and one quad, which is what let the detail below — the flowers, the tufts,
 * the second row of hills — be added at all.
 *
 * What moves stays separate: clouds and birds are Images on tweens, which cost
 * nothing per frame beyond their transform.
 *
 * Drawn at a large negative depth so scenes can keep adding things normally
 * without thinking about layering.
 */

import { DESIGN } from './theme.js';

const SKY = {
  top: '#8fd4f5',
  horizon: '#dff2fb',
  hillBack: '#86c76a',
  hillFront: '#63b04b',
  hillShade: '#57a041',
  ground: '#d9c48c',
  groundEdge: '#c7ad70',
  sun: '#ffd75e',
  cloud: '#ffffff',
};

/** Where the grass starts, as a fraction of the design height. */
const HORIZON = 0.74;

/** Flower colours. Small, scattered, and the only saturated thing out here. */
const PETALS = ['#ff6b6b', '#ffd93d', '#ff9ff3', '#ffffff', '#c77dff'];

/**
 * A deterministic pseudo-random number in [0, 1).
 *
 * The scenery has to look scattered but be identical every time it is drawn:
 * the texture is cached across scenes, so a Math.random() meadow would rearrange
 * itself whenever the cache was missed and make screenshot comparisons useless.
 */
function scatter(seed) {
  const x = Math.sin(seed * 12.9898) * 43758.5453;
  return x - Math.floor(x);
}

/** One cloud: overlapping circles, so it reads as a cloud and not a pill. */
function drawCloud(ctx, cx, cy, scale) {
  ctx.fillStyle = SKY.cloud;
  const blobs = [
    [0, 0, 34],
    [-38, 8, 26],
    [34, 10, 24],
    [-14, -18, 24],
    [18, -14, 20],
  ];
  for (const [dx, dy, r] of blobs) {
    ctx.beginPath();
    ctx.arc(cx + dx * scale, cy + dy * scale, r * scale, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillRect(cx - 44 * scale, cy, 88 * scale, 18 * scale);
}

/** A cloud on its own transparent texture, so it can be moved as one Image. */
function cloudTexture(scene) {
  const key = 'scenery:cloud';
  if (scene.textures.exists(key)) return key;
  const w = 180;
  const h = 90;
  const canvas = scene.textures.createCanvas(key, w, h);
  drawCloud(canvas.context, w / 2, h / 2, 1);
  canvas.refresh();
  return key;
}

/**
 * A bird: two arcs, which is all a bird is at this size.
 *
 * Drawn rather than an emoji because an emoji is a different art style on every
 * platform, and the one thing this scenery has to be is consistent.
 */
function birdTexture(scene) {
  const key = 'scenery:bird';
  if (scene.textures.exists(key)) return key;
  const size = 48;
  const canvas = scene.textures.createCanvas(key, size, size * 0.6);
  const ctx = canvas.context;
  ctx.strokeStyle = '#5b6b7a';
  ctx.lineWidth = 3;
  ctx.lineCap = 'round';
  for (const side of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(size / 2, size * 0.3);
    ctx.quadraticCurveTo(
      size / 2 + side * 8,
      size * 0.1,
      size / 2 + side * 18,
      size * 0.22
    );
    ctx.stroke();
  }
  canvas.refresh();
  return key;
}

/** A tuft of grass, a few blades from one point. */
function drawTuft(ctx, x, y, scale, colour) {
  ctx.strokeStyle = colour;
  ctx.lineWidth = 2.5 * scale;
  ctx.lineCap = 'round';
  for (const lean of [-1, -0.35, 0.35, 1]) {
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.quadraticCurveTo(
      x + lean * 6 * scale,
      y - 9 * scale,
      x + lean * 11 * scale,
      y - 15 * scale
    );
    ctx.stroke();
  }
}

/** A flower: five petals and a middle, the way a child draws one. */
function drawFlower(ctx, x, y, scale, colour) {
  ctx.strokeStyle = '#4c8f3a';
  ctx.lineWidth = 2 * scale;
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x, y - 14 * scale);
  ctx.stroke();

  ctx.fillStyle = colour;
  for (let i = 0; i < 5; i++) {
    const angle = (i / 5) * Math.PI * 2 - Math.PI / 2;
    ctx.beginPath();
    ctx.arc(
      x + Math.cos(angle) * 4.5 * scale,
      y - 14 * scale + Math.sin(angle) * 4.5 * scale,
      3.6 * scale,
      0,
      Math.PI * 2
    );
    ctx.fill();
  }
  ctx.fillStyle = '#ffd93d';
  ctx.beginPath();
  ctx.arc(x, y - 14 * scale, 2.6 * scale, 0, Math.PI * 2);
  ctx.fill();
}

/**
 * The whole static backdrop, rasterised once.
 *
 * Keyed on whether the hills are wanted, because the two versions are different
 * pictures and the busy screens ask for sky alone.
 */
function backdropTexture(scene, hills) {
  const key = `scenery:backdrop:${hills ? 'hills' : 'sky'}`;
  if (scene.textures.exists(key)) return key;

  const { width, height } = DESIGN;
  const canvas = scene.textures.createCanvas(key, width, height);
  const ctx = canvas.context;

  const gradient = ctx.createLinearGradient(0, 0, 0, height);
  gradient.addColorStop(0, SKY.top);
  gradient.addColorStop(1, SKY.horizon);
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);

  // Sun, tucked into a corner where no game puts anything important. Two discs
  // rather than a gradient: a hard edge inside a soft halo reads as a cartoon
  // sun, and a smooth falloff reads as a lens flare.
  ctx.fillStyle = SKY.sun;
  ctx.globalAlpha = 0.5;
  ctx.beginPath();
  ctx.arc(140, 96, 96, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 0.9;
  ctx.beginPath();
  ctx.arc(140, 96, 62, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 1;

  if (!hills) {
    canvas.refresh();
    return key;
  }

  const y = height * HORIZON;
  const ellipse = (cx, cy, rx, ry) => {
    ctx.beginPath();
    ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
    ctx.fill();
  };

  // Overlapping ellipses rather than one arc, so the skyline has a few rolls in
  // it instead of being a single dome.
  ctx.fillStyle = SKY.hillBack;
  for (const [cx, cy, rx, ry] of [
    [140, y + 30, 300, 120],
    [520, y + 44, 360, 140],
    [980, y + 26, 340, 120],
    [1280, y + 40, 300, 130],
  ]) {
    ellipse(cx, cy, rx, ry);
  }
  ctx.fillRect(0, y + 40, width, height - y);

  ctx.fillStyle = SKY.hillFront;
  for (const [cx, cy, rx, ry] of [
    [320, y + 118, 380, 110],
    [900, y + 126, 420, 116],
  ]) {
    ellipse(cx, cy, rx, ry);
  }
  ctx.fillRect(0, y + 118, width, height - y);

  // Grass and flowers across the front hill.
  //
  // The band is measured from where that hill actually is — the tops of its
  // ellipses down to the sand — rather than from the horizon line, which is
  // where the *back* hill starts. Getting that wrong crushes the whole meadow
  // into the last twenty pixels of the screen, half of it behind the ground.
  //
  // Scattered from a fixed seed, thinned towards the middle where the games put
  // their answers, and thinned again low down where the footer sits: decoration
  // behind something a child is reading is just noise.
  const grassTop = y + 20;
  const grassBottom = height - 62;
  for (let i = 0; i < 120; i++) {
    const x = scatter(i * 3.1) * width;
    const depth = scatter(i * 5.3);
    const gy = grassTop + depth * (grassBottom - grassTop);

    const middle = Math.abs(x - width / 2) < 320;
    if (middle && gy > grassTop + 40 && scatter(i * 7.7) < 0.7) continue;

    // Bigger further down the slope, which is the only perspective cue a flat
    // drawing like this gets.
    const scale = 0.75 + depth * 0.9;
    drawTuft(ctx, x, gy, scale, depth > 0.55 ? SKY.hillShade : SKY.hillBack);

    if (scatter(i * 11.3) > 0.68) {
      drawFlower(
        ctx,
        x + 13 * scale,
        gy,
        scale,
        PETALS[Math.floor(scatter(i * 13.7) * PETALS.length)]
      );
    }
  }

  ctx.fillStyle = SKY.ground;
  ctx.fillRect(0, height - 54, width, 54);
  ctx.fillStyle = SKY.groundEdge;
  ctx.fillRect(0, height - 54, width, 8);

  canvas.refresh();
  return key;
}

/**
 * Paints the backdrop into a scene.
 *
 * @param {Phaser.Scene} scene
 * @param {object} [options]
 * @param {boolean} [options.hills=true] Some screens are busy at the bottom
 *   (the flashcard letter strip, the balloon field) and read better with sky
 *   alone.
 * @param {boolean} [options.clouds=true]
 * @param {boolean} [options.birds=true]
 * @returns {Phaser.GameObjects.Container}
 */
export function addScenery(scene, options = {}) {
  const { hills = true, clouds = true, birds = true } = options;
  const layer = scene.add.container(0, 0).setDepth(-100);

  layer.add(
    scene.add
      .image(0, 0, backdropTexture(scene, hills))
      .setOrigin(0, 0)
      .setDisplaySize(DESIGN.width, DESIGN.height)
  );

  if (clouds) {
    // Each cloud drifts on its own slow loop. Movement in the background is
    // what makes a screen feel alive while nothing is being tapped, and slow
    // enough that it never pulls attention off the game.
    const key = cloudTexture(scene);
    for (const [x, y, scale, seconds] of [
      [280, 130, 1, 78],
      [720, 82, 0.72, 96],
      [1080, 168, 0.86, 64],
    ]) {
      const cloud = scene.add.image(x, y, key).setScale(scale).setAlpha(0.92);
      layer.add(cloud);
      scene.tweens.add({
        targets: cloud,
        x: DESIGN.width + 200,
        duration: seconds * 1000 * ((DESIGN.width + 200 - x) / (DESIGN.width + 400)),
        onComplete: () => {
          cloud.setX(-200);
          scene.tweens.add({
            targets: cloud,
            x: DESIGN.width + 200,
            duration: seconds * 1000,
            repeat: -1,
            onRepeat: () => cloud.setX(-200),
          });
        },
      });
    }
  }

  if (birds) {
    // A pair of birds crossing now and then, rather than always there. Constant
    // background motion stops registering within about a minute; something that
    // happens occasionally keeps being noticed, and being noticed is the entire
    // job of scenery.
    const key = birdTexture(scene);
    const flock = [];
    for (let i = 0; i < 2; i++) {
      const bird = scene.add
        .image(-100, 0, key)
        .setScale(0.6 + i * 0.25)
        .setAlpha(0);
      layer.add(bird);
      flock.push(bird);
    }

    const flyPast = () => {
      if (!scene.scene.isActive()) return;
      const fromLeft = Math.random() < 0.5;
      const y = 120 + Math.random() * 120;
      flock.forEach((bird, i) => {
        const start = fromLeft ? -80 - i * 70 : DESIGN.width + 80 + i * 70;
        const end = fromLeft ? DESIGN.width + 120 : -120;
        bird.setPosition(start, y + i * 26).setAlpha(0.75).setFlipX(!fromLeft);
        scene.tweens.add({
          targets: bird,
          x: end,
          duration: 11000 + Math.random() * 5000,
          onComplete: () => bird.setAlpha(0),
        });
        // A slow bob on the way across, so they are gliding rather than sliding.
        scene.tweens.add({
          targets: bird,
          y: bird.y - 14,
          duration: 1400 + i * 200,
          yoyo: true,
          repeat: -1,
          ease: 'Sine.easeInOut',
        });
      });
      scene.time.delayedCall(24000 + Math.random() * 20000, flyPast);
    };
    scene.time.delayedCall(4000 + Math.random() * 8000, flyPast);
  }

  return layer;
}
