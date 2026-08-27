import { sparkleBurst, starShower } from '../particles.js';
import * as sfx from '../sfx.js';
import { SUPERSAMPLE } from './canvas.js';
import {
  budTexture,
  caneTexture,
  flowerTexture,
  groundTexture,
  ladybirdTexture,
  leafTexture,
  potTexture,
  stemTexture,
  varietyFor,
  LEAF_ORIGIN,
  POT,
  STEM,
} from './greenery.js';

/* A vine climbing a cane, one leaf per right answer, a flower at the top. */

/* Every piece is baked oversampled, so every sprite is drawn back down again. */
const DRAW = 1 / SUPERSAMPLE;

/* Air at the top, for the flower to open into. */
const HEAD = 34;

/* How far the pot stands into the grass, so it is not balanced on a line. */
const POT_LIFT = 6;

/* The soil surface: where the vine starts and everything above is measured from. */
const FOOT = POT_LIFT + POT.height + POT.rim;

/* The most steps a level can be worth — `stepsForLevel` caps at twelve. */
const MAX_STEPS = 12;

/* Slots up the cane for the levels already finished. */
const SLOTS = 20;
const SLOT_X = 44;
const BLOSSOM = 20;
const BLOOM = 58;

/** Puts a vine in the rail's box.
 * @param {Phaser.Scene} scene
 * @param {{width: number, height: number}} box measured from its bottom centre
 * @param {{rider?: boolean}} [options] Set `rider` to add a ladybird.
 * @returns {Phaser.GameObjects.Container} the indicator contract
 */
export function create(scene, { width, height }, options = {}) {
  const { rider = false } = options;
  const root = scene.add.container(0, 0);

  // Everything is laid out against the box rather than against numbers typed here.
  const span = Math.max(90, height - FOOT - HEAD);
  const caneFoot = -(POT_LIFT + POT.height * 0.4);

  root.add(
    scene.add.image(0, 0, groundTexture(scene, width)).setOrigin(0.5, 1).setScale(DRAW)
  );
  // The cane goes in before the pot, so it is planted in the soil rather than standing on the rim.
  root.add(
    scene.add
      .image(0, caneFoot, caneTexture(scene, FOOT + span + caneFoot))
      .setOrigin(0.5, 1)
      .setScale(DRAW)
  );
  root.add(
    scene.add.image(0, -POT_LIFT, potTexture(scene)).setOrigin(0.5, 1).setScale(DRAW)
  );

  /* One stem and one leaf per step, all built now and shown as they are earned. */
  const stems = [];
  const leaves = [];
  for (let i = 0; i < MAX_STEPS; i++) {
    const stem = scene.add
      .image(0, 0, stemTexture(scene, varietyFor(0)))
      .setOrigin(0.5, 1)
      .setVisible(false);
    const leaf = scene.add
      .image(0, 0, leafTexture(scene, varietyFor(0)))
      .setOrigin(LEAF_ORIGIN.x, LEAF_ORIGIN.y)
      .setVisible(false);
    stems.push(stem);
    leaves.push(leaf);
    root.add(stem);
    root.add(leaf);
  }

  /* The levels already finished, pinned up the cane, over the leaves. */
  const blossoms = [];
  for (let j = 0; j < SLOTS; j++) {
    const blossom = scene.add
      .image(
        (j % 2 ? -1 : 1) * SLOT_X,
        -(FOOT + (span * (j + 0.6)) / SLOTS),
        flowerTexture(scene, varietyFor(j), BLOSSOM)
      )
      .setScale(DRAW)
      .setVisible(false);
    blossoms.push(blossom);
    root.add(blossom);
  }

  /* The growing tip, and the flower it becomes. */
  const bud = scene.add
    .image(0, -FOOT, budTexture(scene, varietyFor(0)))
    .setOrigin(0.5, 1)
    .setScale(DRAW);
  root.add(bud);
  const bloom = scene.add.image(0, -FOOT, flowerTexture(scene, varietyFor(0), BLOOM));
  bloom.setScale(DRAW).setVisible(false);
  root.add(bloom);

  /* Somebody to do the climbing, for the indicator that has one. */
  const bug = rider
    ? scene.add.image(0, -FOOT, ladybirdTexture(scene)).setScale(DRAW)
    : null;
  if (bug) {
    root.add(bug);
    // Position the climber at the current level.
    Object.defineProperty(root, 'rider', { get: () => Math.round(bug.y) });
  }

  let variety = varietyFor(0);
  let steps = MAX_STEPS;
  let cell = span / steps;
  let leafScale = 1;
  let shown = 0;

  /* Where the tip of a vine of `k` segments is. */
  const tipY = (k) => -(FOOT + k * cell);

  /* Just under the tip. */
  const rideY = (k) => Math.min(tipY(k) + 12, -FOOT - 2);

  /* What is on screen, read off the sprites rather than tracked beside them. */
  const republish = () => {
    const kind = bud.texture.key.split(':').pop();
    root.drawn = `vine:${kind}:${stems.filter((stem) => stem.visible).length}`;
    root.row = `flowers:${blossoms.filter((blossom) => blossom.visible).length}`;
    root.species = kind;
  };

  /* Re-lays the whole cane for a level: which plant, how many steps are in it, and which flowers are already hanging on it. */
  const layout = (level, forSteps) => {
    variety = varietyFor(level);
    steps = Math.max(1, Math.min(MAX_STEPS, forSteps || MAX_STEPS));
    cell = span / steps;
    leafScale = DRAW * Math.min(1, Math.max(0.58, cell / STEM.height));

    // A cell tall on screen.
    const stemY = (DRAW * cell) / STEM.height;
    const stemX = DRAW * Math.min(1, Math.max(0.5, cell / 80));
    const stemKey = stemTexture(scene, variety);
    const leafKey = leafTexture(scene, variety);

    for (let i = 0; i < MAX_STEPS; i++) {
      const right = i % 2 === 0;
      const foot = -(FOOT + i * cell);
      stems[i].setTexture(stemKey).setPosition(0, foot).setScale(stemX, stemY).setFlipX(!right);
      // Joined at the apex of the stem's bow.
      leaves[i]
        .setTexture(leafKey)
        .setOrigin(right ? LEAF_ORIGIN.x : 1 - LEAF_ORIGIN.x, LEAF_ORIGIN.y)
        .setPosition((right ? 1 : -1) * STEM.bow * (stemX / DRAW), foot - cell / 2)
        .setScale(leafScale)
        .setFlipX(!right);
    }

    bud.setTexture(budTexture(scene, variety));

    for (let j = 0; j < SLOTS; j++) {
      // Once there are more finished levels than slots.
      const which = level <= SLOTS ? j : level - SLOTS + j;
      blossoms[j].setTexture(flowerTexture(scene, varietyFor(which), BLOSSOM));
      blossoms[j].setVisible(level > j);
    }
  };

  /* Shows exactly `k` segments, saying nothing about how they got there. */
  const face = (k) => {
    shown = Math.max(0, Math.min(steps, k));
    for (let i = 0; i < MAX_STEPS; i++) {
      const on = i < shown;
      // Anything mid-fade has to be stopped.
      scene.tweens.killTweensOf(stems[i]);
      scene.tweens.killTweensOf(leaves[i]);
      stems[i].setVisible(on).setAlpha(1);
      leaves[i].setVisible(on).setAlpha(1).setScale(leafScale).setAngle(0);
    }
    scene.tweens.killTweensOf(bud);
    bud.setPosition(0, tipY(shown)).setVisible(true).setScale(DRAW).setAlpha(1).setAngle(0);
    scene.tweens.killTweensOf(bloom);
    bloom.setVisible(false);
    if (bug) {
      scene.tweens.killTweensOf(bug);
      bug.setPosition(0, rideY(shown)).setAngle(0).setScale(DRAW).setAlpha(1);
    }
    republish();
  };

  /* One more leaf, and the tip carried up to it. */
  const grow = (k) => {
    const from = shown;
    face(k);
    sfx.water();
    for (let i = from; i < shown; i++) {
      const leaf = leaves[i];
      stems[i].setAlpha(0);
      leaf.setScale(leafScale * 0.3).setAlpha(0);
      scene.tweens.add({
        targets: stems[i],
        alpha: 1,
        delay: (i - from) * 90,
        duration: 160,
      });
      scene.tweens.add({
        targets: leaf,
        alpha: 1,
        scale: leafScale,
        delay: (i - from) * 90 + 60,
        duration: 240,
        ease: 'Back.easeOut',
      });
    }
    bud.setPosition(0, tipY(from));
    const rise = 260 + (shown - from) * 60;
    scene.tweens.add({
      targets: bud,
      y: tipY(shown),
      duration: rise,
      ease: 'Quad.easeOut',
    });
    if (bug) {
      bug.setPosition(0, rideY(from));
      scene.tweens.add({ targets: bug, y: rideY(shown), duration: rise, ease: 'Quad.easeOut' });
      // A squash on the way, so it climbs rather than slides.
      scene.tweens.add({
        targets: bug,
        scaleY: DRAW * 0.82,
        duration: rise / 2,
        yoyo: true,
        ease: 'Sine.easeInOut',
      });
    }
  };

  /* Water taken back: the top of the vine withers rather than vanishing. */
  const slip = (k) => {
    const from = shown;
    sfx.nudge();
    for (let i = Math.max(0, k); i < from && i < MAX_STEPS; i++) {
      const stem = stems[i];
      const leaf = leaves[i];
      scene.tweens.add({
        targets: [stem, leaf],
        alpha: 0,
        duration: 200,
        onComplete: () => {
          stem.setVisible(false);
          leaf.setVisible(false);
        },
      });
    }
    scene.tweens.killTweensOf(bud);
    scene.tweens.add({
      targets: bud,
      y: tipY(Math.max(0, k)),
      angle: { from: 0, to: -8 },
      duration: 300,
      ease: 'Sine.easeInOut',
      onComplete: () => bud.setAngle(0),
    });
    if (bug) {
      // Down two, with a turn.
      scene.tweens.killTweensOf(bug);
      scene.tweens.add({
        targets: bug,
        y: rideY(Math.max(0, k)),
        angle: { from: 0, to: 360 },
        duration: 420,
        ease: 'Quad.easeIn',
        onComplete: () => bug.setAngle(0),
      });
    }
    // The count is true immediately even though the fade is still running.
    shown = Math.max(0, Math.min(steps, k));
    for (let i = shown; i < MAX_STEPS; i++) stems[i].setVisible(false);
    republish();
  };

  /* The bud opens at the top of the cane, and is then pinned to the row. */
  const flower = (next) => {
    face(steps);
    bud.setVisible(false);
    bloom.setPosition(0, tipY(steps)).setVisible(true).setScale(DRAW * 0.2).setAlpha(1);
    sfx.tada();
    scene.tweens.add({ targets: bloom, scale: DRAW, duration: 420, ease: 'Back.easeOut' });
    sparkleBurst(scene, 0, tipY(steps), {
      count: 30,
      tint: [0xffffff, 0xffc93c, 0x8fd4f5],
    });
    starShower(scene, { duration: 1500 });
    republish();

    // Long enough to be looked at, then hung on the cane and the next one started from the soil.
    scene.time.delayedCall(1400, () => {
      if (!scene.scene.isActive()) return;
      const slot = blossoms[Math.min(next.level, SLOTS) - 1];
      scene.tweens.add({
        targets: bloom,
        x: slot ? slot.x : 0,
        y: slot ? slot.y : tipY(steps),
        scale: (DRAW * BLOSSOM) / BLOOM,
        duration: 460,
        ease: 'Quad.easeInOut',
        onComplete: () => {
          if (!scene.scene.isActive()) return;
          layout(next.level, next.steps);
          face(next.step ?? 0);
        },
      });
    });
  };

  root.focus = { x: 0, y: -(FOOT + span * 0.5) };

  root.apply = (next, previous) => {
    if (next.levelledUp) return void flower(next);

    layout(next.level, next.steps);
    const to = Math.round(next.step ?? (next.fraction ?? 0) * steps);
    if (next.reset) return void face(to);
    // Losing a level slips even where the step number happens to go up.
    if (next.levelledDown || to < shown) return void slip(to);
    if (to === shown) return void face(to);
    grow(to);
  };

  root.land = () => sparkleBurst(scene, 0, tipY(shown), { count: 10, tint: [0x8fd4f5, 0xffffff] });

  root.cheer = () =>
    scene.tweens.add({
      targets: bud,
      angle: { from: -6, to: 6 },
      duration: 150,
      yoyo: true,
      repeat: 2,
      ease: 'Sine.easeInOut',
      onComplete: () => bud.setAngle(0),
    });

  /* The droop, not a frown — nothing here tells anybody off. */
  root.wonder = () => {
    const drooping = [bud, ...leaves.filter((leaf) => leaf.visible)];
    scene.tweens.add({
      targets: drooping,
      angle: { from: 0, to: 10 },
      duration: 190,
      yoyo: true,
      repeat: 1,
      ease: 'Sine.easeInOut',
      onComplete: () => {
        for (const item of drooping) item.setAngle(0);
      },
    });
  };

  return root;
}

/* A frame with no progress event behind it, for the preview sheet. */
export function still(scene, box, { fraction, level }, options = {}) {
  const steps = Math.min(5 + level, MAX_STEPS);
  const el = create(scene, box, options);
  const state = { fraction, level, steps, step: Math.round(fraction * steps) };
  el.apply({ ...state, reset: true }, state);
  return el;
}

export const NAME = 'Vine';
