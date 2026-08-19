import { sparkleBurst, starShower } from '../particles.js';
import { sway } from '../liveliness.js';
import * as sfx from '../sfx.js';
import { ellipse, makeCanvas, publish, SUPERSAMPLE } from './canvas.js';

/**
 * A seed that grows into a fruiting tree, one pour of water per right answer.
 *
 * ## What it is for
 *
 * A number in a circle is a dashboard: written for somebody who reads, which
 * the child this app is for does not. What they do understand is that a plant
 * they water gets bigger, that a small plant is early and a tree with fruit on
 * it is a long way in, and that a plant which droops wants something from them.
 *
 *   wet soil -> a shoot -> leaves -> a young tree -> a tree with fruit
 *
 * A tree that fruits is a level, and the next seed goes straight into the pot —
 * a different one each time, so the question "what is this one going to be?"
 * survives the fiftieth tree. The row of small trees at the top of the rail is
 * every tree grown so far, which is the part that accumulates across days: the
 * pot resets every level and on its own would say nothing about a fortnight of
 * playing.
 *
 * ## A mistake takes water back
 *
 * A wrong answer costs two pours against the one a right answer earns, and may
 * cross back into the previous tree — see the note in progress.js for why that
 * rule changed. It is still not a fail state: nothing locks, no round ends, and
 * the droop lasts a second.
 *
 * ## Drawn, not loaded
 *
 * Every frame of growth is a canvas texture drawn from numbers, the same
 * approach as the meadow in scenery.js and for the same reasons: growth is
 * continuous, so no set of drawn images would ever have the right number of
 * them, and an image model cannot draw the same plant eleven times at eleven
 * sizes without it becoming a different plant.
 */

/** Growth steps between bare soil and a full tree. */
const STEPS = 10;

/** The pot's own drawing, in design pixels, measured up from the pot's base. */
const POT = { topWidth: 96, baseWidth: 68, height: 54, rim: 13 };

/** The canvas a plant is drawn into. Origin is the bottom centre of the pot. */
const PLANT = { width: 200, height: 400 };

/** How tall a full-grown tree stands above the soil. */
const REACH = 236;

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

/** The shelf of finished trees at the top of the rail: three across, rows up. */
const ROW = { columns: 3, cell: 60, rows: 4 };
const ORCHARD_MAX = ROW.columns * ROW.rows;

/**
 * One small tree for every tree already grown.
 *
 * The pot resets at every level, so on its own it would say nothing about a
 * fortnight of playing; this shelf is the fortnight. It shrinks too — a wrong
 * answer that crosses back a level takes a tree off it, which is the strongest
 * form the setback takes and most of the reason it is worth having.
 *
 * Twelve fit before the shelf stops growing, which is roughly a month of daily
 * playing. Past that the seed in the pot still changes, and the flattening is
 * written down in future-plans.md rather than pretended away.
 */
function orchardTexture(scene, trees) {
  const shown = Math.min(trees, ORCHARD_MAX);
  const key = `orchard:rail:${shown}`;
  if (scene.textures.exists(key)) return key;

  const width = ROW.columns * ROW.cell;
  const height = ROW.rows * ROW.cell;
  const { canvas, ctx } = makeCanvas(width, height, width / 2, height);

  for (let i = 0; i < shown; i++) {
    const column = i % ROW.columns;
    const row = Math.floor(i / ROW.columns);
    // Left to right, bottom row first: the newest tree lands on top, where a
    // child watching the ceremony is already looking.
    const x = (column - (ROW.columns - 1) / 2) * ROW.cell;
    const y = -row * ROW.cell;
    drawSmallTree(ctx, x, y, ROW.cell - 6, speciesFor(i), 1);
  }

  return publish(scene, key, canvas);
}

/**
 * A strip of grass across the foot of the rail.
 *
 * Without it the pot stands on the bottom edge of a panel, which reads as the
 * drawing having been cut off rather than as a pot standing on the ground.
 */
function groundTexture(scene, width) {
  const key = `plant:ground:${Math.round(width)}`;
  if (scene.textures.exists(key)) return key;
  const { canvas, ctx } = makeCanvas(width, 54, width / 2, 54);
  ellipse(ctx, 0, -6, width / 2 - 4, 30, '#5da13f');
  ellipse(ctx, 0, -14, width / 2 - 12, 24, '#79bd55');
  return publish(scene, key, canvas);
}

// ------------------------------------------------------------------- the pot

/**
 * Puts the garden in the rail's box.
 *
 * @param {Phaser.Scene} scene
 * @param {{width: number, height: number}} box measured from its bottom centre
 * @returns {Phaser.GameObjects.Container} the indicator contract — see
 *   src/lib/indicators/index.js
 */
export function create(scene, { width, height }) {
  const root = scene.add.container(0, 0);

  // The pot at the foot, the shelf of finished trees directly above where a
  // full-grown tree reaches, and nothing between them. One scale for the whole
  // composition rather than one per piece: the menu's corner is a quarter the
  // height of the rail, and scaling only the plant against it left the shelf
  // taller than the box and the plant with negative room to grow into.
  const shelfHeight = ROW.rows * ROW.cell;
  const natural = PLANT.height + 8 + shelfHeight;
  const scale = Math.min(1, height / natural, width / PLANT.width);
  const draw = scale / SUPERSAMPLE;

  root.add(
    scene.add
      .image(0, 0, groundTexture(scene, PLANT.width))
      .setOrigin(0.5, 1)
      .setScale(draw)
  );

  const orchard = scene.add.image(0, -(PLANT.height + 8) * scale, orchardTexture(scene, 0));
  orchard.setOrigin(0.5, 1).setScale(draw);
  root.add(orchard);

  const plant = scene.add.image(0, 0, plantTexture(scene, SPECIES[0], 0, false));
  plant.setOrigin(0.5, 1).setScale(draw);
  root.add(plant);

  let species = SPECIES[0];
  let step = 0;
  let breeze = sway(scene, plant, { angle: 1.6, duration: 2600 });

  /**
   * Swaps in a frame of growth.
   *
   * `drawn` is read back off the sprite rather than set beside it, and that is
   * the whole point of it: a plant whose model counts perfectly while the
   * picture never changes is exactly the failure a check against the model
   * would pass, and a `drawn` assigned from the key rather than from the sprite
   * is the same failure one step further in.
   */
  /**
   * Keys this instance has baked, oldest first, so they can be thrown away.
   *
   * Eleven steps times six seeds is sixty-six possible frames, and each one is
   * a 300x600 canvas — a little under three quarters of a megabyte on the GPU.
   * Left uncapped, a long sitting would bake its way through tens of megabytes
   * of them on a phone. Three is enough: the frame on screen, the one it just
   * came from, and the fruiting frame the level-up holds.
   */
  const baked = [];
  const KEEP = 3;

  const face = (toStep, fruiting = false) => {
    step = toStep;
    const key = plantTexture(scene, species, toStep, fruiting);
    plant.setTexture(key);
    root.drawn = plant.texture.key;
    root.step = toStep;
    root.species = species.id;

    const already = baked.indexOf(key);
    if (already > -1) baked.splice(already, 1);
    baked.push(key);
    while (baked.length > KEEP) {
      const drop = baked.shift();
      if (drop !== plant.texture.key) scene.textures.remove(drop);
    }
  };

  const shelf = (trees) => {
    orchard.setTexture(orchardTexture(scene, trees));
    root.row = orchard.texture.key;
  };
  shelf(0);

  /** Water falling, then the plant springing up into its new size. */
  const pour = (toStep) => {
    sfx.water();
    for (let i = 0; i < 4; i++) {
      const drop = scene.add.ellipse(
        (Math.random() - 0.5) * 44,
        -PLANT.height * scale * 0.8,
        7,
        11,
        0x62b8f0,
        0.9
      );
      root.add(drop);
      scene.tweens.add({
        targets: drop,
        y: -POT.height * scale - 6,
        delay: i * 70,
        duration: 260,
        ease: 'Quad.easeIn',
        onComplete: () => {
          drop.destroy();
          if (i < 3) return;
          face(toStep);
          scene.tweens.add({
            targets: plant,
            scaleY: draw * 1.1,
            scaleX: draw * 0.94,
            duration: 180,
            yoyo: true,
            ease: 'Back.easeOut',
          });
        },
      });
    }
  };

  /** Water taken back. The plant sags to its smaller self rather than snapping. */
  const wither = (toStep) => {
    face(toStep);
    breeze?.stop();
    scene.tweens.add({
      targets: plant,
      angle: { from: 0, to: 7 },
      scaleY: draw * 0.9,
      duration: 260,
      yoyo: true,
      ease: 'Sine.easeInOut',
      onComplete: () => {
        plant.setAngle(0).setScale(draw);
        breeze = sway(scene, plant, { angle: 1.6, duration: 2600 });
      },
    });
  };

  /** The tree fruits, and then the next seed goes in. */
  const bloom = (next) => {
    face(STEPS, true);
    sfx.tada();
    sparkleBurst(scene, 0, -PLANT.height * scale * 0.6, {
      count: 30,
      tint: [0xffffff, 0xffc93c, 0x8fd4f5],
    });
    starShower(scene, { duration: 1500 });
    scene.tweens.add({
      targets: plant,
      scale: draw * 1.12,
      duration: 300,
      yoyo: true,
      ease: 'Back.easeOut',
    });
    // Long enough to be looked at, then banked onto the shelf and replanted.
    scene.time.delayedCall(1500, () => {
      if (!scene.scene.isActive()) return;
      species = speciesFor(next.level);
      shelf(next.level);
      face(stepFor(next));
      scene.tweens.add({
        targets: orchard,
        scaleY: draw * 1.12,
        duration: 220,
        yoyo: true,
        ease: 'Back.easeOut',
      });
    });
  };

  root.focus = { x: 0, y: -POT.height * scale - 20 };

  root.apply = (next, previous) => {
    if (next.levelledUp) return void bloom(next);

    species = speciesFor(next.level);
    if (next.level !== previous.level || next.reset) shelf(next.level);
    const toStep = stepFor(next);
    if (next.reset) return void face(toStep);
    // Losing a level withers even when the step number happens to go up:
    // dropping from the start of one tree to the end of the last one is a tree
    // taken off the shelf, which is the biggest thing a mistake can do.
    if (toStep < step || next.level < previous.level) return void wither(toStep);
    pour(toStep);
  };

  root.land = () =>
    sparkleBurst(scene, 0, root.focus.y, { count: 10, tint: [0x8fd4f5, 0xffffff] });

  root.cheer = () =>
    scene.tweens.add({
      targets: plant,
      angle: { from: -3, to: 3 },
      duration: 150,
      yoyo: true,
      repeat: 2,
      ease: 'Sine.easeInOut',
      onComplete: () => plant.setAngle(0),
    });

  /** The droop, not a frown — see the note at the top. */
  root.wonder = () =>
    scene.tweens.add({
      targets: plant,
      angle: { from: 0, to: 9 },
      duration: 190,
      yoyo: true,
      repeat: 1,
      ease: 'Sine.easeInOut',
      onComplete: () => plant.setAngle(0),
    });

  return root;
}

/** Used by the preview sheet, which draws a frame without a progress event. */
export function still(scene, box, { fraction, level }) {
  const el = create(scene, box);
  el.apply({ fraction, level, reset: true }, { fraction, level });
  return el;
}

export const NAME = 'Plant';
