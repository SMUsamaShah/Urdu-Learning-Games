import Phaser from 'phaser';
import { allLetterGlyphs, letterGlyph, lettersById, shapeFamilySiblings } from '../lib/content.js';
import { addGlyph, fitEmAlone } from '../lib/glyph.js';
import * as sfx from '../lib/sfx.js';
import { finished, rightAnswer } from '../lib/flourish.js';
import { dance } from '../lib/celebrate.js';
import { queueBackdrop } from '../lib/backdrops.js';
import { addStage, wellDone } from '../lib/stage.js';
import { bob, hop } from '../lib/liveliness.js';
import { sparkleBurst } from '../lib/particles.js';
import { sayLetter } from '../lib/say.js';
import { COLORS, DESIGN } from '../lib/theme.js';

/**
 * Put each letter in the basket it belongs to.
 *
 * ## Sorting is a different job from choosing
 *
 * Every "which one is it?" screen here hands a child one question at a time and
 * takes it away once answered. Sorting hands them a pile and two places to put
 * it, and the work is to keep asking themselves the same question over and over
 * against a changing thing. That is much closer to reading a line of text than
 * any single-answer game, and it is the reason this is worth a screen of its
 * own rather than being FindLetter with baskets.
 *
 * The two baskets are labelled with letters from the *same shape family* — ب
 * and ت, or ج and چ — so every letter in the pile differs from the wrong
 * basket by a dot or two. Sorting ب from ک would be a colour-matching game.
 *
 * ## Dragged, not tapped
 *
 * The second drag screen after LetterPuzzle, and here the drag carries meaning
 * a tap could not: the letter goes *into* a place, and which place is the whole
 * answer. A letter dropped anywhere else swims back to the pile, so a vague
 * drag costs nothing but another go.
 */

/** Letters in the pile, by how many piles have been sorted. */
const PILE_BY_ROUND = [4, 5, 6, 6, 8];

const BASKET = { width: 250, height: 150, y: DESIGN.height - 118 };
/**
 * One colour each, fixed rather than taken from the letter's shape family.
 *
 * The two baskets are always siblings, so a family colour gives both the same
 * red and they read as one wide thing rather than as two places. The colour
 * does not give the answer away — it is the letter on the front that decides —
 * but it does let a child keep track of which one they are aiming at.
 */
const BASKET_COLORS = [0x3f7fd4, 0xd4762f];
/** Where a letter waiting to be sorted sits. */
const PILE = { y: 250, left: 300, right: DESIGN.width - 80 };
/** How close to a basket's middle a letter must be dropped to go in. */
const SNAP = 150;

export default class Baskets extends Phaser.Scene {
  constructor() {
    super('Baskets');
    this.round = 0;
    /** The two letters being sorted between. */
    this.kinds = [];
    /** @type {Phaser.GameObjects.Container[]} */
    this.tiles = [];
    this.sorted = 0;
    this.locked = false;
  }

  preload() {
    queueBackdrop(this);
  }

  create() {
    this.round = 0;
    this.stage = addStage(this, {
      instruction: 'sort-letters',
      roman: 'Sort the letters',
      mascot: { x: 104, y: 300, height: 168 },
    });
    this.banner = this.stage.banner;
    this.mascot = this.stage.mascot;

    this.baskets = this.add.container(0, 0);
    this.pile = this.add.container(0, 0);

    this.input.on('drag', (pointer, tile, x, y) => {
      if (tile.sorted) return;
      tile.setPosition(x, y);
    });
    this.input.on('dragstart', (pointer, tile) => {
      if (tile.sorted) return;
      sfx.tap();
      tile.idle?.stop();
      tile.setDepth(30).setScale(1.1);
      sayLetter(tile.letterId, { word: false });
    });
    this.input.on('dragend', (pointer, tile) => this.drop(tile));

    this.newRound();
  }

  // ------------------------------------------------------------------ round

  newRound() {
    this.baskets.removeAll(true);
    this.pile.removeAll(true);
    this.tiles = [];
    this.sorted = 0;
    this.locked = false;
    this.banner.setInstruction('sort-letters', 'Sort the letters');

    // Two letters that look alike. A family with a sibling if there is one,
    // because telling ب from ت is the exercise; telling ب from ک is not.
    const withSiblings = [...lettersById.keys()].filter(
      (id) => letterGlyph(id) && shapeFamilySiblings(id).some((s) => letterGlyph(s))
    );
    const first = Phaser.Utils.Array.GetRandom(
      withSiblings.length ? withSiblings : [...lettersById.keys()]
    );
    const second = Phaser.Utils.Array.GetRandom(
      shapeFamilySiblings(first).filter((id) => letterGlyph(id))
    );
    this.kinds = [first, second];

    const count = PILE_BY_ROUND[Math.min(this.round, PILE_BY_ROUND.length - 1)];
    // Both kinds always present, so neither basket is left empty — an empty
    // basket at the end reads as a mistake rather than as a finished job.
    const ids = Phaser.Utils.Array.Shuffle(
      Array.from({ length: count }, (_, i) => this.kinds[i % 2])
    );

    this.buildBaskets();
    this.buildPile(ids);
    this.mascot?.point();
  }

  buildBaskets() {
    const { em } = fitEmAlone(allLetterGlyphs('isolated'), 96, 64);
    const step = BASKET.width + 120;
    const startX = DESIGN.width / 2 + step / 2;

    this.kinds.forEach((id, index) => {
      const x = startX - index * step;
      const colour = BASKET_COLORS[index % BASKET_COLORS.length];
      const basket = this.add.container(x, BASKET.y);
      basket.letterId = id;
      basket.x0 = x;

      const box = this.add.graphics();
      box.fillStyle(COLORS.shadow, 0.2);
      box.fillRoundedRect(-BASKET.width / 2, -BASKET.height / 2 + 8, BASKET.width, BASKET.height, 20);
      box.fillStyle(colour, 1);
      box.fillRoundedRect(-BASKET.width / 2, -BASKET.height / 2, BASKET.width, BASKET.height, 20);
      // A pale band across the top, so it reads as a basket with an opening
      // rather than as a coloured slab.
      box.fillStyle(0xffffff, 0.32);
      box.fillRoundedRect(-BASKET.width / 2 + 10, -BASKET.height / 2 + 10, BASKET.width - 20, 44, 14);
      basket.add(box);

      basket.add(
        addGlyph(
          this,
          0,
          14,
          `baskets-label:em${Math.round(em)}:${id}`,
          letterGlyph(id, 'isolated'),
          { em, color: COLORS.onColor }
        )
      );
      this.baskets.add(basket);
    });
  }

  buildPile(ids) {
    const { em } = fitEmAlone(allLetterGlyphs('isolated'), 82, 70);
    const span = PILE.right - PILE.left;
    const step = Math.min(140, span / ids.length);
    const startX = (PILE.left + PILE.right) / 2 + ((ids.length - 1) * step) / 2;

    ids.forEach((id, index) => {
      const tile = this.add.container(startX - index * step, PILE.y);
      tile.letterId = id;
      tile.sorted = false;
      tile.homeX = tile.x;
      tile.homeY = tile.y;

      const plate = this.add.graphics();
      plate.fillStyle(COLORS.shadow, 0.2);
      plate.fillRoundedRect(-55, -47, 110, 110, 18);
      plate.fillStyle(COLORS.card, 1);
      plate.fillRoundedRect(-55, -55, 110, 110, 18);
      plate.lineStyle(4, COLORS.outline, 0.35);
      plate.strokeRoundedRect(-55, -55, 110, 110, 18);
      tile.add(plate);
      tile.add(
        addGlyph(
          this,
          0,
          0,
          `baskets:em${Math.round(em)}:${id}`,
          letterGlyph(id, 'isolated'),
          { em, color: COLORS.ink }
        )
      );

      tile.setSize(110, 110);
      tile.setInteractive({ draggable: true, useHandCursor: true });
      this.input.setDraggable(tile);
      tile.idle = bob(this, tile, { distance: 4, duration: 2200, delay: index * 160 });

      this.pile.add(tile);
      this.tiles.push(tile);
    });
  }

  // ------------------------------------------------------------------- play

  drop(tile) {
    if (tile.sorted || this.locked) return;
    tile.setDepth(0).setScale(1);

    const basket = this.baskets.list.find(
      (b) => Phaser.Math.Distance.Between(tile.x, tile.y, b.x, b.y) < SNAP
    );

    if (!basket) {
      // Dropped in mid-air. Back to the pile rather than left floating, so what
      // is still to be sorted stays legible as a row.
      this.tweens.add({
        targets: tile,
        x: tile.homeX,
        y: tile.homeY,
        duration: 240,
        ease: 'Back.easeOut',
      });
      tile.idle = bob(this, tile, { distance: 4, duration: 2200 });
      return;
    }

    if (basket.letterId !== tile.letterId) {
      sfx.nudge();
      this.mascot?.wonder();
      // The basket shakes it off. Refused rather than punished: the letter goes
      // home and can be tried again, and nothing is counted against anybody.
      this.tweens.add({
        targets: basket,
        x: basket.x0 + 10,
        duration: 60,
        yoyo: true,
        repeat: 2,
        ease: 'Sine.easeInOut',
      });
      this.tweens.add({
        targets: tile,
        x: tile.homeX,
        y: tile.homeY,
        duration: 300,
        ease: 'Back.easeOut',
      });
      tile.idle = bob(this, tile, { distance: 4, duration: 2200 });
      return;
    }

    tile.sorted = true;
    tile.disableInteractive();
    this.sorted++;
    rightAnswer();
    sfx.sparkle();
    sparkleBurst(this, tile.x, tile.y, { count: 16, tint: [COLORS.correct, 0xffffff] });
    hop(this, basket, { height: 12 });

    // Drops in and out of sight: the basket keeps what it has been given, and
    // the pile visibly shrinks towards being finished.
    this.tweens.add({
      targets: tile,
      x: basket.x,
      y: basket.y + 10,
      scaleX: 0.5,
      scaleY: 0.5,
      alpha: 0,
      duration: 300,
      ease: 'Quad.easeIn',
    });

    if (this.sorted < this.tiles.length) return;

    this.locked = true;
    finished();
    for (const b of this.baskets.list) dance(this, b);
    this.time.delayedCall(700, () => {
      wellDone(this, this.stage, { duration: 2400 });
      this.round++;
      this.time.delayedCall(2200, () => this.newRound());
    });
  }
}
