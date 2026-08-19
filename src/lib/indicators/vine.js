import { sparkleBurst, starShower } from '../particles.js';
import * as sfx from '../sfx.js';
import { SUPERSAMPLE } from './canvas.js';
import {
  budTexture,
  caneTexture,
  flowerTexture,
  groundTexture,
  leafTexture,
  potTexture,
  stemTexture,
  varietyFor,
  LEAF_ORIGIN,
  POT,
  STEM,
} from './greenery.js';

/**
 * A vine climbing a cane, one leaf per right answer, a flower at the top.
 *
 * ## Why a climb rather than a plant
 *
 * The rail is 200 pixels wide and 570 tall. A pot plant is the wrong shape for
 * that and no amount of adjusting makes it the right one: it is widest at the
 * top, it stops growing at about its own height, and everything above it is
 * empty panel. The thing that came before this drew itself 648 pixels tall,
 * shrank to fit, and reached less than half way up the strip when fully grown.
 *
 * A climb fits, because the shape of the rail *is* the shape of the task. The
 * cane is drawn floor to ceiling before anything has happened, so the strip
 * always reads as somewhere with a top to get to. What a right answer changes
 * is what is on the cane, never how much of the strip has anything in it.
 *
 *   a sprout in a pot -> leaves winding up -> a bud at the top -> it opens
 *
 * ## What accumulates
 *
 * A level is one climb. The flower it opens with is then pinned to the cane and
 * the next vine climbs past it, so a fortnight of playing is a cane with
 * flowers up it where an afternoon is a cane with one. Eight slots; past that
 * the oldest gives up its place and the row shows the eight most recent, which
 * at least keeps changing where the orchard this replaced went flat for ever.
 *
 * ## Assembled, not redrawn
 *
 * Every piece is a small texture baked once in greenery.js — a length of stem,
 * one leaf, a flower, the cane. Growth is one more sprite becoming visible.
 * Nothing here bakes a picture of the whole vine, which is what made the plant
 * expensive (sixty-six frames at three quarters of a megabyte apiece, behind a
 * cache that threw them away as fast as it made them).
 */

/**
 * Every piece is baked oversampled, so every sprite is drawn back down again.
 *
 * Miss this and the whole thing is half as big again as the box it was given:
 * the cane grows out through the top of the rail, the positions are still in
 * design pixels, and nothing lines up with anything.
 */
const DRAW = 1 / SUPERSAMPLE;

/** Air at the top, for the flower to open into. */
const HEAD = 34;

/** How far the pot stands into the grass, so it is not balanced on a line. */
const POT_LIFT = 6;

/** The soil surface: where the vine starts and everything above is measured from. */
const FOOT = POT_LIFT + POT.height + POT.rim;

/** The most steps a level can be worth — `stepsForLevel` caps at twelve. */
const MAX_STEPS = 12;

/** Slots up the cane for the levels already finished. */
const SLOTS = 8;
const SLOT_X = 46;
const BLOSSOM = 30;
const BLOOM = 58;

/**
 * Puts a vine in the rail's box.
 *
 * @param {Phaser.Scene} scene
 * @param {{width: number, height: number}} box measured from its bottom centre
 * @returns {Phaser.GameObjects.Container} the indicator contract — see
 *   src/lib/indicators/index.js
 */
export function create(scene, { width, height }) {
  const root = scene.add.container(0, 0);

  // Everything is laid out against the box rather than against numbers typed
  // here, which is the whole difference between this and what it replaced. The
  // menu hands over a box a quarter the height of the rail's and gets the same
  // vine, shorter.
  const span = Math.max(90, height - FOOT - HEAD);
  const caneFoot = -(POT_LIFT + POT.height * 0.4);

  root.add(
    scene.add.image(0, 0, groundTexture(scene, width)).setOrigin(0.5, 1).setScale(DRAW)
  );
  // The cane goes in before the pot, so it is planted in the soil rather than
  // standing on the rim.
  root.add(
    scene.add
      .image(0, caneFoot, caneTexture(scene, FOOT + span + caneFoot))
      .setOrigin(0.5, 1)
      .setScale(DRAW)
  );
  root.add(
    scene.add.image(0, -POT_LIFT, potTexture(scene)).setOrigin(0.5, 1).setScale(DRAW)
  );

  /** One stem and one leaf per step, all built now and shown as they are earned. */
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

  /** The levels already finished, pinned up the cane, over the leaves. */
  const blossoms = [];
  for (let j = 0; j < SLOTS; j++) {
    const blossom = scene.add
      .image(
        (j % 2 ? -1 : 1) * SLOT_X,
        -(FOOT + (span * (j + 0.7)) / SLOTS),
        flowerTexture(scene, varietyFor(j), BLOSSOM)
      )
      .setScale(DRAW)
      .setVisible(false);
    blossoms.push(blossom);
    root.add(blossom);
  }

  /** The growing tip, and the flower it becomes. */
  const bud = scene.add
    .image(0, -FOOT, budTexture(scene, varietyFor(0)))
    .setOrigin(0.5, 1)
    .setScale(DRAW);
  root.add(bud);
  const bloom = scene.add.image(0, -FOOT, flowerTexture(scene, varietyFor(0), BLOOM));
  bloom.setScale(DRAW).setVisible(false);
  root.add(bloom);

  let variety = varietyFor(0);
  let steps = MAX_STEPS;
  let cell = span / steps;
  let leafScale = 1;
  let shown = 0;

  /** Where the tip of a vine of `k` segments is. */
  const tipY = (k) => -(FOOT + k * cell);

  /**
   * What is on screen, read off the sprites rather than tracked beside them.
   *
   * A vine whose model counts perfectly while the picture never changes is
   * exactly the fault a check against the model would pass, so `drawn` counts
   * the stems that are actually visible and takes the variety off the bud's own
   * texture. It ends in the step count because verify-progress.mjs asserts a
   * fresh vine matches /:0$/.
   */
  const republish = () => {
    const kind = bud.texture.key.split(':').pop();
    root.drawn = `vine:${kind}:${stems.filter((stem) => stem.visible).length}`;
    root.row = `flowers:${blossoms.filter((blossom) => blossom.visible).length}`;
    root.species = kind;
  };

  /**
   * Re-lays the whole cane for a level: which plant, how many steps are in it,
   * and which flowers are already hanging on it.
   *
   * A level is worth five steps at the start and twelve later on, so a cell is
   * anywhere from a fifth to a twelfth of the climb. The stem stretches
   * vertically to whatever that is — invisible on a smooth curve — while the
   * leaves take a uniform scale with a floor under it, so a twelve-step level
   * comes out as a denser vine rather than a thinner one.
   */
  const layout = (level, forSteps) => {
    variety = varietyFor(level);
    steps = Math.max(1, Math.min(MAX_STEPS, forSteps || MAX_STEPS));
    cell = span / steps;
    leafScale = DRAW * Math.min(1, Math.max(0.58, cell / STEM.height));

    // A cell tall on screen: the texture is STEM.height design pixels baked
    // oversampled, so the factor that gets it there is DRAW × cell / height.
    const stemY = (DRAW * cell) / STEM.height;
    const stemX = DRAW * Math.min(1, Math.max(0.5, cell / 80));
    const stemKey = stemTexture(scene, variety);
    const leafKey = leafTexture(scene, variety);

    for (let i = 0; i < MAX_STEPS; i++) {
      const right = i % 2 === 0;
      const foot = -(FOOT + i * cell);
      stems[i].setTexture(stemKey).setPosition(0, foot).setScale(stemX, stemY).setFlipX(!right);
      // Joined at the apex of the stem's bow, which a quadratic puts half way
      // to its control point — so half a cell up, and `bow` out to the side.
      // Flipping mirrors the texture inside the frame but leaves the origin
      // where it was, so a leaf flipped for the left side would hang off the
      // vine by its tip. The origin has to be mirrored with it.
      leaves[i]
        .setTexture(leafKey)
        .setOrigin(right ? LEAF_ORIGIN.x : 1 - LEAF_ORIGIN.x, LEAF_ORIGIN.y)
        .setPosition((right ? 1 : -1) * STEM.bow * (stemX / DRAW), foot - cell / 2)
        .setScale(leafScale)
        .setFlipX(!right);
    }

    bud.setTexture(budTexture(scene, variety));

    for (let j = 0; j < SLOTS; j++) {
      // Once there are more finished levels than slots, the row shows the eight
      // most recent — so it keeps moving instead of freezing as eight identical
      // flowers for ever, which is what the orchard did.
      const which = level <= SLOTS ? j : level - SLOTS + j;
      blossoms[j].setTexture(flowerTexture(scene, varietyFor(which), BLOSSOM));
      blossoms[j].setVisible(level > j);
    }
  };

  /** Shows exactly `k` segments, saying nothing about how they got there. */
  const face = (k) => {
    shown = Math.max(0, Math.min(steps, k));
    for (let i = 0; i < MAX_STEPS; i++) {
      const on = i < shown;
      // Anything mid-fade has to be stopped, or a tween that was on its way out
      // finishes after this and hides a segment that is now supposed to be up.
      scene.tweens.killTweensOf(stems[i]);
      scene.tweens.killTweensOf(leaves[i]);
      stems[i].setVisible(on).setAlpha(1);
      leaves[i].setVisible(on).setAlpha(1).setScale(leafScale).setAngle(0);
    }
    scene.tweens.killTweensOf(bud);
    bud.setPosition(0, tipY(shown)).setVisible(true).setScale(DRAW).setAlpha(1).setAngle(0);
    scene.tweens.killTweensOf(bloom);
    bloom.setVisible(false);
    republish();
  };

  /** One more leaf, and the tip carried up to it. */
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
    scene.tweens.add({
      targets: bud,
      y: tipY(shown),
      duration: 260 + (shown - from) * 60,
      ease: 'Quad.easeOut',
    });
  };

  /** Water taken back: the top of the vine withers rather than vanishing. */
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
    // The count is true immediately even though the fade is still running: what
    // is published is what the vine now *is*, not what is still on screen for
    // another fifth of a second.
    shown = Math.max(0, Math.min(steps, k));
    for (let i = shown; i < MAX_STEPS; i++) stems[i].setVisible(false);
    republish();
  };

  /** The bud opens at the top of the cane, and is then pinned to the row. */
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

    // Long enough to be looked at, then hung on the cane and the next one
    // started from the soil.
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
    // Losing a level slips even where the step number happens to go up: coming
    // off the start of one climb onto the end of the last one takes a flower
    // off the cane, which is the biggest thing a mistake can do.
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

  /** The droop, not a frown — nothing here tells anybody off. */
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

/**
 * A frame with no progress event behind it, for the preview sheet.
 *
 * The sheet knows a fraction and a level; the vine counts in whole steps, so
 * the rest of the state is worked out here rather than the vine being made to
 * take a fraction it would only round.
 */
export function still(scene, box, { fraction, level }) {
  const steps = Math.min(5 + level, MAX_STEPS);
  const el = create(scene, box);
  const state = { fraction, level, steps, step: Math.round(fraction * steps) };
  el.apply({ ...state, reset: true }, state);
  return el;
}

export const NAME = 'Vine';
