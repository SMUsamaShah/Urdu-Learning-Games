import { onProgress, state } from './progress.js';
import { sparkleBurst, starShower } from './particles.js';
import { sway } from './liveliness.js';
import * as sfx from './sfx.js';

/**
 * The thing that grows, in place of a number that goes up.
 *
 * ## Why a plant and not a ring
 *
 * The ring this replaces counted correctly and meant nothing. A number in a
 * circle is a dashboard: it is written for somebody who reads, and the child
 * this app is for does not. What they do understand is that a plant they water
 * gets bigger, that a small plant is early and a tree with fruit on it is a
 * long way in, and that a plant which droops wants something from them.
 *
 * So the progress *is* the plant. There is no separate score to read off:
 *
 *   wet soil -> a shoot -> leaves -> a young tree -> a tree with fruit
 *
 * One right answer is one pour of water. A tree that fruits is a level, and the
 * next seed goes straight into the pot — a different one each time, so the
 * question "what is this one going to be?" survives the fiftieth tree.
 *
 * ## A mistake takes water back
 *
 * A wrong answer costs two pours against the one a right answer earns, and it
 * is allowed to cross back into the previous tree. That is a deliberate break
 * with what this app did before, where nothing was ever taken away — see the
 * note on it in progress.js. A plant that can only ever grow is scenery; a
 * plant that visibly shrinks when you guess wildly is the thing that makes
 * guessing wildly feel like a choice.
 *
 * It is still not a fail state. Nothing is locked, no round ends, and the
 * droop lasts a second. The worst a bad run does is put the tree back a stage.
 *
 * ## Drawn, not loaded
 *
 * Every frame of growth is a canvas texture drawn from numbers, the same
 * approach as the meadow in scenery.js and for the same reasons: it is
 * continuous, so no set of drawn images would ever have the right number of
 * them, and an image model cannot draw the same plant eleven times at eleven
 * sizes without it becoming a different plant. Thirty lines of arcs also cost
 * nothing offline, which a hundred pictures of a tree would not.
 *
 * A texture per growth step, baked once and shared by every screen — a Phaser
 * Graphics re-tessellates every frame whether or not it changed, and this one
 * changes about once a minute.
 */

/** Growth steps between bare soil and a full tree. */
const STEPS = 10;

/** The pot's own drawing, in design pixels, measured up from the pot's base. */
const POT = { topWidth: 96, baseWidth: 68, height: 54, rim: 13 };

/** The canvas a plant is drawn into. Origin is the bottom centre of the pot. */
const PLANT = { width: 300, height: 372 };

/** The mound the pot and the finished trees stand on. */
const MOUND = { width: 320, height: 150 };

/** How far above the mound texture's foot its crown sits — where the pot goes. */
const MOUND_CROWN = 22;

/** How tall a full-grown tree stands above the soil. */
const REACH = 214;

const SUPERSAMPLE = 1.5;

/**
 * The seeds, in the order they are planted.
 *
 * Six, because a child who has grown six trees has been playing for a week and
 * a seventh kind is a smaller reward than seeing the apple tree come round
 * again. Each one is four colours; the drawing is shared.
 */
export const SPECIES = [
  { id: 'apple', leaf: '#54a83f', shade: '#3d8730', trunk: '#8a5a34', fruit: '#e34b3f', gloss: '#ff8a80' },
  { id: 'orange', leaf: '#3f9e56', shade: '#2f7f42', trunk: '#8d6239', fruit: '#f5901f', gloss: '#ffc06b' },
  { id: 'lemon', leaf: '#6fae35', shade: '#578f28', trunk: '#94663c', fruit: '#f2ce2a', gloss: '#fff08a' },
  { id: 'plum', leaf: '#489a63', shade: '#357a4c', trunk: '#7f5533', fruit: '#8e5bbd', gloss: '#c39be0' },
  { id: 'pomegranate', leaf: '#5aa347', shade: '#437f34', trunk: '#8a5d38', fruit: '#c8354f', gloss: '#f07b8c' },
  { id: 'mango', leaf: '#4f9f4a', shade: '#3a7c37', trunk: '#8f6238', fruit: '#f0a52a', gloss: '#ffd07a' },
];

/** Which seed is in the pot at a given level. */
export function speciesFor(level) {
  return SPECIES[((level % SPECIES.length) + SPECIES.length) % SPECIES.length];
}

/** Where the growth stands, 0 to STEPS, for a progress state. */
export function stepFor(progress) {
  return Math.round(Math.min(1, Math.max(0, progress.fraction)) * STEPS);
}

const POT_CLAY = '#c9713f';
const POT_DARK = '#a95a30';
const POT_RIM = '#dc8049';
const SOIL = '#5a3d28';
const SOIL_WET = '#3f2a1b';
const GRASS = '#79bd55';
const GRASS_DARK = '#5da13f';

/** A canvas to draw into, at the supersample, with the origin where it helps. */
function makeCanvas(width, height, originX, originY) {
  const canvas = document.createElement('canvas');
  canvas.width = Math.ceil(width * SUPERSAMPLE);
  canvas.height = Math.ceil(height * SUPERSAMPLE);
  const ctx = canvas.getContext('2d');
  ctx.scale(SUPERSAMPLE, SUPERSAMPLE);
  ctx.translate(originX, originY);
  return { canvas, ctx };
}

function publish(scene, key, canvas) {
  const texture = scene.textures.createCanvas(key, canvas.width, canvas.height);
  // createCanvas returns null when another scene got there first, which is the
  // normal case on the second screen of a session.
  if (!texture) return key;
  texture.context.drawImage(canvas, 0, 0);
  texture.refresh();
  return key;
}

const ellipse = (ctx, x, y, rx, ry, fill) => {
  ctx.fillStyle = fill;
  ctx.beginPath();
  ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
  ctx.fill();
};

// ------------------------------------------------------------------- the pot

function drawPot(ctx) {
  const { topWidth, baseWidth, height, rim } = POT;

  ctx.fillStyle = POT_CLAY;
  ctx.beginPath();
  ctx.moveTo(-topWidth / 2, -height);
  ctx.lineTo(topWidth / 2, -height);
  ctx.lineTo(baseWidth / 2, 0);
  ctx.lineTo(-baseWidth / 2, 0);
  ctx.closePath();
  ctx.fill();

  // A shaded right-hand side, so the pot reads as round rather than as a
  // trapezium. One flat highlight does more than a gradient at this size.
  ctx.fillStyle = POT_DARK;
  ctx.beginPath();
  ctx.moveTo(topWidth / 2 - 20, -height);
  ctx.lineTo(topWidth / 2, -height);
  ctx.lineTo(baseWidth / 2, 0);
  ctx.lineTo(baseWidth / 2 - 14, 0);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = POT_RIM;
  ctx.beginPath();
  ctx.roundRect(-topWidth / 2 - 5, -height - rim, topWidth + 10, rim + 4, 5);
  ctx.fill();
}

/**
 * Soil, wet at the start and drying as the plant takes over.
 *
 * The empty pot is the one state a child sees before they have done anything,
 * so it has to look like something is about to happen rather than like a
 * missing picture. Wet soil and a seed sitting in it does that.
 */
function drawSoil(ctx, growth) {
  const y = -POT.height - POT.rim + 6;
  ellipse(ctx, 0, y, POT.topWidth / 2 - 4, 10, growth > 0.2 ? SOIL : SOIL_WET);
  if (growth > 0.06) return;
  // The seed, before anything has come up.
  ellipse(ctx, 2, y - 2, 9, 6, '#6b4a2c');
  ellipse(ctx, 0, y - 4, 6, 4, '#8a6238');
}

// ----------------------------------------------------------------- the plant

/** Where the stem is at height fraction `t`, and how wide it is there. */
function stemAt(t, growth) {
  const base = -POT.height - POT.rim + 4;
  const reach = REACH * growth;
  const y = base - reach * t;
  // A lean that straightens as it thickens: a shoot flops, a trunk does not.
  const x = Math.sin(t * Math.PI * 0.8) * 12 * (1 - growth * 0.7);
  const thick = (2.5 + 13 * growth) * (1 - t * 0.55);
  return { x, y, thick };
}

function drawStem(ctx, species, growth) {
  const steps = 14;
  const left = [];
  const right = [];
  for (let i = 0; i <= steps; i++) {
    const { x, y, thick } = stemAt(i / steps, growth);
    left.push([x - thick, y]);
    right.push([x + thick, y]);
  }
  ctx.fillStyle = growth > 0.5 ? species.trunk : species.shade;
  ctx.beginPath();
  ctx.moveTo(left[0][0], left[0][1]);
  for (const [x, y] of left) ctx.lineTo(x, y);
  for (let i = right.length - 1; i >= 0; i--) ctx.lineTo(right[i][0], right[i][1]);
  ctx.closePath();
  ctx.fill();
}

/**
 * One pointed leaf, pivoting at the stem and lifting away from it.
 *
 * The rotation is negated against the side it is on. Canvas angles run
 * clockwise with y downwards, so the same sign lifts one leaf and droops the
 * one opposite it — which is precisely what the first version of this did, and
 * it made every plant look like it needed watering at the moment it had just
 * been watered.
 */
function drawLeaf(ctx, x, y, length, side, tilt, fill) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(-side * tilt);
  ctx.fillStyle = fill;
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.quadraticCurveTo(side * length * 0.45, -length * 0.44, side * length, 0);
  ctx.quadraticCurveTo(side * length * 0.45, length * 0.3, 0, 0);
  ctx.fill();
  ctx.restore();
}

function drawLeaves(ctx, species, growth) {
  // Two from the very first shoot, so there is a plant rather than a stick as
  // soon as anything has come up at all.
  const count = Math.min(6, 2 + Math.floor(growth * 6));
  const length = 30 + 26 * growth;
  for (let i = 0; i < count; i++) {
    const t = 0.28 + (0.56 * i) / Math.max(count - 1, 1);
    const { x, y } = stemAt(t, growth);
    const side = i % 2 ? 1 : -1;
    drawLeaf(ctx, x, y, length, side, 0.5, i % 2 ? species.leaf : species.shade);
  }
}

/** The canopy, which is what turns a plant with leaves on it into a tree. */
function drawCanopy(ctx, species, growth, fruiting) {
  if (growth < 0.62) return;
  const spread = (growth - 0.62) / 0.38;
  const top = stemAt(1, growth);
  const radius = 26 + 34 * spread;

  const blobs = [
    [0, -radius * 0.5, radius],
    [-radius * 0.78, -radius * 0.1, radius * 0.82],
    [radius * 0.78, -radius * 0.1, radius * 0.82],
    [-radius * 0.4, radius * 0.42, radius * 0.66],
    [radius * 0.4, radius * 0.42, radius * 0.66],
  ];
  ctx.fillStyle = species.shade;
  for (const [dx, dy, r] of blobs) ellipse(ctx, top.x + dx, top.y + dy, r, r * 0.92, species.shade);
  // A lighter crown on top, so the canopy has a lit side.
  for (const [dx, dy, r] of blobs.slice(0, 3)) {
    ellipse(ctx, top.x + dx, top.y + dy - r * 0.22, r * 0.78, r * 0.66, species.leaf);
  }

  if (!fruiting) return;
  const fruits = [
    [-radius * 0.55, radius * 0.2],
    [radius * 0.5, radius * 0.05],
    [0, radius * 0.55],
  ];
  for (const [dx, dy] of fruits) {
    const fx = top.x + dx;
    const fy = top.y + dy;
    ellipse(ctx, fx, fy, 13, 13, species.fruit);
    ellipse(ctx, fx - 4, fy - 4, 4.5, 4, species.gloss);
  }
}

/**
 * One frame of growth, baked.
 *
 * @param {number} step 0 (wet soil) to STEPS (a full tree)
 * @param {boolean} fruiting whether the fruit is on it — the moment a level is
 *   finished, held for the ceremony and then replanted
 */
export function plantTexture(scene, species, step, fruiting) {
  const key = `plant:${species.id}:${step}${fruiting ? ':fruit' : ''}`;
  if (scene.textures.exists(key)) return key;

  const { canvas, ctx } = makeCanvas(PLANT.width, PLANT.height, PLANT.width / 2, PLANT.height);
  const growth = step / STEPS;

  drawPot(ctx);
  drawSoil(ctx, growth);
  if (growth > 0.06) {
    drawStem(ctx, species, growth);
    drawLeaves(ctx, species, growth);
    drawCanopy(ctx, species, growth, fruiting);
  }
  return publish(scene, key, canvas);
}

// --------------------------------------------------------------- the orchard

/** A finished tree, small, standing behind the pot. */
function drawSmallTree(ctx, x, ground, height, species, fade) {
  ctx.globalAlpha = fade;
  const trunkWidth = height * 0.13;
  ctx.fillStyle = species.trunk;
  ctx.fillRect(x - trunkWidth / 2, ground - height * 0.5, trunkWidth, height * 0.5);
  const radius = height * 0.34;
  ellipse(ctx, x, ground - height * 0.62, radius * 1.05, radius, species.shade);
  ellipse(ctx, x, ground - height * 0.72, radius * 0.8, radius * 0.72, species.leaf);
  ellipse(ctx, x - radius * 0.4, ground - height * 0.6, 3.4, 3.4, species.fruit);
  ellipse(ctx, x + radius * 0.42, ground - height * 0.68, 3.4, 3.4, species.fruit);
  ctx.globalAlpha = 1;
}

/**
 * Where a finished tree stands, in the order the row fills up.
 *
 * Both sides of the pot and outwards, front row first, so one tree is a tree
 * next to the pot rather than something in a corner. The middle is left empty
 * because the pot is drawn over it.
 *
 * Eight is as many as the mound holds at a size that still reads as a tree.
 * Past that the row stops growing, which is a real flattening a long way in —
 * see the note in future-plans.md.
 */
const ORCHARD_SPOTS = [
  { x: -78, back: false },
  { x: 78, back: false },
  { x: -46, back: true },
  { x: 46, back: true },
  { x: -138, back: false },
  { x: 138, back: false },
  { x: -110, back: true },
  { x: 110, back: true },
];

/**
 * The mound, and one small tree for every tree already grown.
 *
 * This is the part that accumulates. The plant in the pot resets every level,
 * so on its own it would say nothing about a fortnight of playing; the row
 * behind it is the fortnight. It shrinks too — a wrong answer that crosses back
 * a level takes a tree out of the row, which is the strongest form the setback
 * takes and the reason it is worth having at all.
 */
export function orchardTexture(scene, trees) {
  const shown = Math.min(trees, ORCHARD_SPOTS.length);
  const key = `orchard:${shown}`;
  if (scene.textures.exists(key)) return key;

  const { canvas, ctx } = makeCanvas(MOUND.width, MOUND.height, MOUND.width / 2, MOUND.height);

  // The mound first and the trees standing on it. The other way round buries
  // every trunk to its middle and turns a row of trees into a row of bushes.
  ellipse(ctx, 0, -16, MOUND.width / 2 - 6, 32, GRASS_DARK);
  ellipse(ctx, 0, -24, MOUND.width / 2 - 14, 26, GRASS);

  // The back rank is smaller, paler and stood higher up the mound, which is
  // what lets eight trees share the width one spider used to take.
  for (let i = 0; i < shown; i++) {
    const { x, back } = ORCHARD_SPOTS[i];
    drawSmallTree(ctx, x, back ? -46 : -28, back ? 66 : 84, speciesFor(i), back ? 0.78 : 1);
  }

  return publish(scene, key, canvas);
}

// ------------------------------------------------------------------- the pot

/**
 * Puts the garden on a screen and keeps it in step with the total.
 *
 * @param {Phaser.Scene} scene
 * @param {number} x
 * @param {number} y the ground it stands on, not its centre
 * @param {{height?: number, depth?: number}} [options] height is the mound plus
 *   a full-grown tree, so a young plant is much shorter than this
 * @returns {Phaser.GameObjects.Container} with `flyTo`, `catch`, `cheer` and
 *   `wonder`, so a scene can treat it the way it treated the character
 */
export function addPlant(scene, x, y, options = {}) {
  const { height = 300, depth = 4 } = options;

  const root = scene.add.container(x, y).setDepth(depth).setName('progress-plant');
  // `height` is the whole thing at full growth: the mound, the pot and a tree.
  root.setScale(height / (PLANT.height + MOUND_CROWN));

  let shown = state();
  let species = speciesFor(shown.level);

  const orchard = scene.add.image(0, 0, orchardTexture(scene, shown.level));
  orchard.setOrigin(0.5, 1).setScale(1 / SUPERSAMPLE);
  root.add(orchard);

  // The pot stands on the crown of the mound rather than at its foot.
  const plant = scene.add.image(0, -MOUND_CROWN, plantTexture(scene, species, stepFor(shown), false));
  plant.setOrigin(0.5, 1).setScale(1 / SUPERSAMPLE);
  root.add(plant);

  /** What the model says. Read by tools/verify-progress.mjs. */
  const republish = () => {
    root.growth = stepFor(shown) / STEPS;
    root.step = stepFor(shown);
    root.trees = shown.level;
    root.species = species.id;
  };
  republish();

  /**
   * Swaps in a frame of growth.
   *
   * `root.drawn` is read back off the sprite rather than set beside it, and
   * that is the whole point of it. It is a different thing from `root.step`
   * above: a plant whose model counts perfectly while the picture never
   * changes is exactly the failure a check against the model would pass — and
   * a `drawn` assigned from the key rather than from the sprite is the same
   * failure one step further in. Deleting the setTexture below has to be
   * enough to turn tools/verify-progress.mjs red, and it is only enough if
   * this reads the sprite.
   */
  const face = (step, fruiting = false) => {
    plant.setTexture(plantTexture(scene, species, step, fruiting));
    root.drawn = plant.texture.key;
  };

  /** The same, for the row of finished trees behind the pot. */
  const row = (trees) => {
    orchard.setTexture(orchardTexture(scene, trees));
    root.row = orchard.texture.key;
  };
  row(shown.level);
  face(stepFor(shown));

  /** Where a star thrown from an answer should land: on the soil. */
  root.flyTo = { x, y: y - height * 0.42 };

  let breeze = sway(scene, plant, { angle: 1.6, duration: 2600 });

  /**
   * Water falling, and then the plant springing up into its new size.
   *
   * The drops matter more than they look: they are what makes the growth
   * *caused* by the answer rather than a thing that happened at the same time.
   * The texture swaps as the last one lands.
   */
  const pour = (toStep) => {
    sfx.water();
    const top = -PLANT.height * 0.72;
    for (let i = 0; i < 4; i++) {
      const drop = scene.add.ellipse(
        (Math.random() - 0.5) * 46,
        top,
        7,
        11,
        0x62b8f0,
        0.9
      );
      root.add(drop);
      scene.tweens.add({
        targets: drop,
        y: -POT.height - MOUND_CROWN - 6,
        delay: i * 70,
        duration: 260,
        ease: 'Quad.easeIn',
        onComplete: () => {
          drop.destroy();
          if (i < 3) return;
          face(toStep);
          scene.tweens.add({
            targets: plant,
            scaleY: (1 / SUPERSAMPLE) * 1.1,
            scaleX: (1 / SUPERSAMPLE) * 0.94,
            duration: 180,
            yoyo: true,
            ease: 'Back.easeOut',
          });
        },
      });
    }
    sparkleBurst(scene, root.x, root.flyTo.y, { count: 8, tint: [0x8fd4f5, 0xffffff] });
  };

  /** Water taken back. The plant sags to its smaller self rather than snapping. */
  const wither = (toStep) => {
    face(toStep);
    breeze?.stop();
    scene.tweens.add({
      targets: plant,
      angle: { from: 0, to: 7 },
      scaleY: (1 / SUPERSAMPLE) * 0.9,
      duration: 260,
      yoyo: true,
      ease: 'Sine.easeInOut',
      onComplete: () => {
        plant.setAngle(0).setScale(1 / SUPERSAMPLE);
        breeze = sway(scene, plant, { angle: 1.6, duration: 2600 });
      },
    });
  };

  /**
   * The tree fruits, and then the next seed goes in.
   *
   * Deliberately the longest thing the plant does. It is what all the pours
   * were for, and if it passes as quickly as a right answer then filling the
   * pot meant nothing.
   */
  const bloom = (next) => {
    face(STEPS, true);
    sfx.tada();
    sparkleBurst(scene, root.x, root.flyTo.y, {
      count: 30,
      tint: [0xffffff, 0xffc93c, 0x8fd4f5],
    });
    starShower(scene, { duration: 1500 });
    scene.tweens.add({
      targets: plant,
      scale: (1 / SUPERSAMPLE) * 1.12,
      duration: 300,
      yoyo: true,
      ease: 'Back.easeOut',
    });
    // Long enough to be looked at, then the fruit is banked into the row behind
    // and the pot starts again.
    scene.time.delayedCall(1500, () => {
      if (!scene.scene.isActive()) return;
      species = speciesFor(next.level);
      row(next.level);
      face(stepFor(next));
      republish();
      scene.tweens.add({
        targets: orchard,
        scaleY: (1 / SUPERSAMPLE) * 1.08,
        duration: 220,
        yoyo: true,
        ease: 'Back.easeOut',
      });
    });
  };

  const apply = (next) => {
    const was = shown;
    shown = next;
    if (next.levelledUp) return bloom(next);

    species = speciesFor(next.level);
    if (next.level !== was.level || next.reset) {
      row(next.level);
    }
    const toStep = stepFor(next);
    republish();
    if (next.reset) return void face(toStep);
    // Losing a level withers even when the step number happens to go up:
    // dropping from the start of one tree to the end of the last one is a tree
    // taken out of the row, which is the biggest thing a mistake can do.
    if (toStep < stepFor(was) || next.level < was.level) return void wither(toStep);
    // Rounding can leave two answers on the same step. Water it anyway — the
    // answer was right, and the pour is the acknowledgement.
    pour(toStep);
  };

  /** Something thrown at the plant has landed. */
  root.catch = () => {
    sparkleBurst(scene, root.x, root.flyTo.y, { count: 10, tint: [0x8fd4f5, 0xffffff] });
  };

  /** A right answer, from the scene's point of view. */
  root.cheer = () => {
    scene.tweens.add({
      targets: plant,
      angle: { from: -3, to: 3 },
      duration: 150,
      yoyo: true,
      repeat: 2,
      ease: 'Sine.easeInOut',
      onComplete: () => plant.setAngle(0),
    });
  };

  /** A wrong one. The droop, not a frown — see the note at the top. */
  root.wonder = () => {
    scene.tweens.add({
      targets: plant,
      angle: { from: 0, to: 9 },
      duration: 190,
      yoyo: true,
      repeat: 1,
      ease: 'Sine.easeInOut',
      onComplete: () => plant.setAngle(0),
    });
  };

  const stop = onProgress(apply);
  scene.events.once('shutdown', stop);
  scene.events.once('destroy', stop);

  return root;
}
