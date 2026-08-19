import { sparkleBurst, starShower } from '../particles.js';
import * as sfx from '../sfx.js';
import { SUPERSAMPLE } from './canvas.js';
import {
  clumpTexture,
  fruitTexture,
  groundTexture,
  trunkTexture,
  varietyFor,
} from './greenery.js';

/**
 * A bare tree that leafs out, one clump per right answer, and then fruits.
 *
 * ## The same rule as the vine, arranged the other way
 *
 * Built to the box, and full of *something* before anything has been earned.
 * For a climb that meant a cane standing floor to ceiling; here it is a tree in
 * winter — trunk, branches, no leaves. A bare tree is still recognisably a
 * tree, which an empty pot is not, and leafing it out a clump at a time is a
 * better unit of progress than a canopy that simply inflates.
 *
 *   bare branches -> leaves filling in -> fruit -> the leaves fall
 *
 * ## Where the clumps go
 *
 * On a phyllotactic spiral: turn by the golden angle each time and step out as
 * the square root of the count. It is the arrangement seeds take in a
 * sunflower head and it is the one thing that fills a round crown evenly at
 * *every* count — five clumps and twelve clumps both look deliberate, where a
 * ring of twelve positions with five filled looks like a broken ring.
 *
 * ## What accumulates
 *
 * One fruit per finished level, left hanging on the branches while the next
 * year's leaves come in around it. Eight of them, and past that the row shows
 * the eight most recent — same as the vine, and for the same reason.
 */

/** Baked oversampled; every sprite made from it is drawn back down. */
const DRAW = 1 / SUPERSAMPLE;

/** How much of the box is trunk. The rest is crown, less a little air. */
const TRUNK_SHARE = 0.44;
const HEAD = 16;

/** The most steps a level can be worth — `stepsForLevel` caps at twelve. */
const MAX_STEPS = 12;

/**
 * Fruit already earned, hung in the crown.
 *
 * Twenty, matching the number of plants the varieties cycle through, so the
 * record fills up exactly as the first kind comes round again. It was eight,
 * which went flat after a fortnight.
 */
const SLOTS = 20;
const FRUIT = 18;

/** The one that swells at the end of a level, before it shrinks into the row. */
const RIPE = 46;

/** The angle a sunflower turns by, in radians. */
const GOLDEN = Math.PI * (3 - Math.sqrt(5));

export function create(scene, { width, height }) {
  const root = scene.add.container(0, 0);

  const trunkHeight = Math.max(90, height * TRUNK_SHARE);
  const spread = Math.min(width * 0.42, 84);
  // The crown starts below the top of the trunk — leaves grow *on* branches,
  // and a canopy floating above the highest twig was the first thing this got
  // wrong — and reaches the top of the box. Two radii rather than one: 200
  // pixels of width against 350 of crown is a poplar, and pretending it is
  // round would either overflow the rail or waste half its height.
  const crownTop = -(height - HEAD);
  const crownBottom = -trunkHeight * 0.78;
  const crownY = (crownTop + crownBottom) / 2;
  const crownRY = (crownBottom - crownTop) / 2;
  const crownRX = Math.min(width * 0.46, crownRY);
  const clumpSize = crownRX * 0.84;

  root.add(scene.add.image(0, 0, groundTexture(scene, width)).setOrigin(0.5, 1).setScale(DRAW));
  root.add(
    scene.add
      .image(0, 0, trunkTexture(scene, trunkHeight, spread))
      .setOrigin(0.5, 1)
      .setScale(DRAW)
  );

/**
   * A point on a phyllotactic spiral inside the crown: turn by the golden angle
   * each step, and move out as the square root of the count.
   *
   * Used for both the leaves and the fruit, at different phases, so twenty
   * fruit thread through twelve leaf clumps instead of landing on them. A ring
   * would have done for eight; twenty round the edge of the crown is a
   * necklace, and twenty on a spiral is a tree with fruit in it.
   */
  const spiral = (i, count, phase, outX, outY) => {
    const angle = phase + i * GOLDEN;
    const out = Math.sqrt((i + 0.4) / count);
    return {
      x: Math.cos(angle) * crownRX * outX * out,
      y: crownY + Math.sin(angle) * crownRY * outY * out,
    };
  };

  /** Where clump `i` sits. */
  const place = (i) => spiral(i, MAX_STEPS, 0, 0.6, 0.74);

  const clumps = [];
  for (let i = 0; i < MAX_STEPS; i++) {
    const { x, y } = place(i);
    const clump = scene.add
      .image(x, y, clumpTexture(scene, varietyFor(0), clumpSize))
      .setScale(DRAW)
      .setVisible(false);
    clumps.push(clump);
    root.add(clump);
  }

  /**
   * The levels already finished, hanging *in* the leaves.
   *
   * They were placed outside the crown first, on a wider ring than the foliage
   * fills, and every one of them ended up as a bead floating in the panel with
   * nothing behind it. Fruit on a tree is among the leaves; these are added
   * after the clumps so they sit in front of them.
   */
  const fruits = [];
  for (let j = 0; j < SLOTS; j++) {
    const { x, y } = spiral(j, SLOTS, GOLDEN / 2, 0.66, 0.8);
    const fruit = scene.add
      .image(x, y, fruitTexture(scene, varietyFor(j), FRUIT))
      .setScale(DRAW)
      .setVisible(false);
    fruits.push(fruit);
    root.add(fruit);
  }

  /** The one that swells when a level finishes, before it joins the row. */
  const ripe = scene.add.image(0, crownY, fruitTexture(scene, varietyFor(0), RIPE));
  ripe.setScale(DRAW).setVisible(false);
  root.add(ripe);

  let steps = MAX_STEPS;
  let shown = 0;

  /**
   * Read off the sprites, never tracked beside them: a tree that counts
   * perfectly while the picture never changes is exactly what a check against
   * the model would pass. `drawn` ends in the step count because
   * verify-progress.mjs asserts a fresh one matches /:0$/.
   */
  const republish = () => {
    const kind = ripe.texture.key.split(':')[2];
    root.drawn = `tree:${kind}:${clumps.filter((clump) => clump.visible).length}`;
    root.row = `fruit:${fruits.filter((fruit) => fruit.visible).length}`;
    root.species = kind;
  };

  const layout = (level, forSteps) => {
    const variety = varietyFor(level);
    steps = Math.max(1, Math.min(MAX_STEPS, forSteps || MAX_STEPS));

    const clumpKey = clumpTexture(scene, variety, clumpSize);
    for (const clump of clumps) clump.setTexture(clumpKey);
    ripe.setTexture(fruitTexture(scene, variety, RIPE));

    for (let j = 0; j < SLOTS; j++) {
      // Past the cap the row shows the most recent, so it keeps moving.
      const which = level <= SLOTS ? j : level - SLOTS + j;
      fruits[j].setTexture(fruitTexture(scene, varietyFor(which), FRUIT));
      fruits[j].setVisible(level > j);
    }
  };

  /** Shows exactly `k` clumps, saying nothing about how they got there. */
  const face = (k) => {
    shown = Math.max(0, Math.min(steps, k));
    for (let i = 0; i < MAX_STEPS; i++) {
      scene.tweens.killTweensOf(clumps[i]);
      const { x, y } = place(i);
      clumps[i]
        .setPosition(x, y)
        .setVisible(i < shown)
        .setAlpha(1)
        .setScale(DRAW);
    }
    scene.tweens.killTweensOf(ripe);
    ripe.setVisible(false);
    republish();
  };

  /** One more clump of leaves, popped in where it belongs. */
  const grow = (k) => {
    const from = shown;
    face(k);
    sfx.water();
    for (let i = from; i < shown; i++) {
      clumps[i].setScale(DRAW * 0.2);
      scene.tweens.add({
        targets: clumps[i],
        scale: DRAW,
        delay: (i - from) * 80,
        duration: 300,
        ease: 'Back.easeOut',
      });
    }
  };

  /** Leaves off the top, blown away rather than deleted. */
  const slip = (k) => {
    const from = shown;
    sfx.nudge();
    for (let i = Math.max(0, k); i < from && i < MAX_STEPS; i++) {
      const clump = clumps[i];
      scene.tweens.add({
        targets: clump,
        y: clump.y + 34,
        alpha: 0,
        scale: DRAW * 0.7,
        duration: 320,
        ease: 'Quad.easeIn',
        onComplete: () => clump.setVisible(false),
      });
    }
    // True immediately, even though the leaves are still falling: what is
    // published is what the tree now *is*.
    shown = Math.max(0, Math.min(steps, k));
    for (let i = shown; i < MAX_STEPS; i++) clumps[i].setVisible(false);
    republish();
  };

  /** It fruits, the fruit joins the row, and the leaves come down. */
  const ripen = (next) => {
    face(steps);
    ripe.setPosition(0, crownY).setVisible(true).setScale(DRAW * 0.2).setAlpha(1);
    sfx.tada();
    scene.tweens.add({ targets: ripe, scale: DRAW, duration: 420, ease: 'Back.easeOut' });
    sparkleBurst(scene, 0, crownY, { count: 30, tint: [0xffffff, 0xffc93c, 0x8fd4f5] });
    starShower(scene, { duration: 1500 });
    republish();

    scene.time.delayedCall(1400, () => {
      if (!scene.scene.isActive()) return;
      const slot = fruits[Math.min(next.level, SLOTS) - 1];
      scene.tweens.add({
        targets: ripe,
        x: slot ? slot.x : 0,
        y: slot ? slot.y : crownY,
        scale: DRAW * (FRUIT / RIPE),
        duration: 460,
        ease: 'Quad.easeInOut',
        onComplete: () => {
          if (!scene.scene.isActive()) return;
          layout(next.level, next.steps);
          // The leaves fall on the way to next year, which is the one moment
          // the tree is allowed to look like it lost something.
          for (const clump of clumps.filter((leaf) => leaf.visible)) {
            scene.tweens.add({
              targets: clump,
              y: clump.y + 60,
              alpha: 0,
              duration: 420,
              ease: 'Quad.easeIn',
            });
          }
          scene.time.delayedCall(440, () => {
            if (!scene.scene.isActive()) return;
            face(next.step ?? 0);
          });
        },
      });
    });
  };

  root.focus = { x: 0, y: crownY };

  root.apply = (next, previous) => {
    if (next.levelledUp) return void ripen(next);

    layout(next.level, next.steps);
    const to = Math.round(next.step ?? (next.fraction ?? 0) * steps);
    if (next.reset) return void face(to);
    if (next.levelledDown || to < shown) return void slip(to);
    if (to === shown) return void face(to);
    grow(to);
  };

  root.land = () => sparkleBurst(scene, 0, crownY, { count: 10, tint: [0x8fd4f5, 0xffffff] });

  root.cheer = () =>
    scene.tweens.add({
      targets: clumps.filter((clump) => clump.visible),
      scale: DRAW * 1.12,
      duration: 160,
      yoyo: true,
      ease: 'Sine.easeInOut',
      onComplete: () => {
        for (const clump of clumps) clump.setScale(DRAW);
      },
    });

  /** A shiver through the crown, not a frown. */
  root.wonder = () =>
    scene.tweens.add({
      targets: root,
      angle: { from: -1.6, to: 1.6 },
      duration: 90,
      yoyo: true,
      repeat: 2,
      ease: 'Sine.easeInOut',
      onComplete: () => root.setAngle(0),
    });

  return root;
}

/** A frame with no progress event behind it, for the preview sheet. */
export function still(scene, box, { fraction, level }) {
  const steps = Math.min(5 + level, MAX_STEPS);
  const el = create(scene, box);
  const state = { fraction, level, steps, step: Math.round(fraction * steps) };
  el.apply({ ...state, reset: true }, state);
  return el;
}

export const NAME = 'Tree';
