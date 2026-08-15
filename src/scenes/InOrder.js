import Phaser from 'phaser';
import { allLetterGlyphs, letterGlyph, lettersById, sequenceFor } from '../lib/content.js';
import { addGlyph, fitEmAlone } from '../lib/glyph.js';
import * as sfx from '../lib/sfx.js';
import { finished, rightAnswer, wrongAnswer } from '../lib/flourish.js';
import { queueBackdrop } from '../lib/backdrops.js';
import { addStage, wellDone } from '../lib/stage.js';
import { bob, hop, popIn, squash } from '../lib/liveliness.js';
import { popPuff, sparkleBurst } from '../lib/particles.js';
import { sayLetter, sayLetters } from '../lib/say.js';
import { COLORS, DESIGN, familyColor } from '../lib/theme.js';

/**
 * Pop them in order.
 *
 * ## Order without a line to read it off
 *
 * Sequence and Caterpillar both lay the alphabet out in a row and ask what goes
 * in a hole, so the run itself is on screen doing half the work — a child can
 * often answer by looking at the two neighbours rather than by knowing the
 * order. Here the letters are scattered, there is no row, and the only way
 * through is to actually know which comes next.
 *
 * That makes it the hardest of the three ordering screens and the right one to
 * meet last. The trail of already-popped letters builds along the bottom as
 * they go, so a child who has lost their place can see where they are — the
 * help arrives as a consequence of getting them right, rather than being on
 * screen from the start.
 *
 * ## Nothing is lost by guessing
 *
 * A wrong bubble wobbles and stays. There is no timer and no score, so tapping
 * every bubble in turn until one gives is a legitimate way to play it, and it
 * is how a child works out what "next" means in the first place.
 */

/** Bubbles on screen, by how many sets have been finished. */
const RUN_BY_ROUND = [3, 4, 4, 5, 6];

const BUBBLE = 118;
/** Where bubbles may sit: clear of the ribbon, the garden and the trail. */
const FIELD = { left: 300, right: DESIGN.width - 90, top: 205, bottom: 500 };
const TRAIL_Y = DESIGN.height - 96;

export default class InOrder extends Phaser.Scene {
  constructor() {
    super('InOrder');
    /** @type {string[]} */
    this.sequence = [];
    this.round = 0;
    /** @type {string[]} the run being asked for, in order */
    this.run = [];
    this.next = 0;
    /** @type {Phaser.GameObjects.Container[]} */
    this.bubbles = [];
    this.locked = false;
  }

  preload() {
    queueBackdrop(this);
  }

  create() {
    this.sequence = sequenceFor('alphabetical').filter((id) => letterGlyph(id));
    this.round = 0;

    this.stage = addStage(this, {
      instruction: 'in-order',
      roman: 'Pop them in order',
      plant: { x: 116, y: 640, height: 196 },
    });
    this.banner = this.stage.banner;
    this.plant = this.stage.plant;

    this.field = this.add.container(0, 0);
    this.trail = this.add.container(0, 0);
    this.fit = fitEmAlone(allLetterGlyphs('isolated'), BUBBLE - 44, BUBBLE - 48);

    this.newRound();
  }

  // ------------------------------------------------------------------ round

  newRound() {
    this.field.removeAll(true);
    this.trail.removeAll(true);
    this.bubbles = [];
    this.next = 0;
    this.locked = false;
    this.banner.setInstruction('in-order', 'Pop them in order');

    const length = Math.min(
      RUN_BY_ROUND[Math.min(this.round, RUN_BY_ROUND.length - 1)],
      this.sequence.length
    );
    const start = Phaser.Math.Between(0, this.sequence.length - length);
    this.run = this.sequence.slice(start, start + length);

    // Scattered on a coarse grid rather than at random points: truly random
    // placement overlaps bubbles, and two overlapping targets are hard for a
    // small finger to choose between.
    const spots = this.scatter(this.run.length);
    Phaser.Utils.Array.Shuffle([...this.run]).forEach((id, index) => {
      this.addBubble(id, spots[index], index);
    });

    // Said as a run, so the order is heard before it is asked for. This is the
    // only clue the screen gives, and it is the right one.
    sayLetters(this.run);
  }

  /** Cells of a grid big enough for the run, shuffled and jittered. */
  scatter(count) {
    const columns = Math.min(count, 3);
    const rows = Math.ceil(count / columns);
    const cellW = (FIELD.right - FIELD.left) / columns;
    const cellH = (FIELD.bottom - FIELD.top) / rows;
    const cells = [];
    for (let i = 0; i < columns * rows; i++) {
      cells.push({
        x: FIELD.left + (i % columns) * cellW + cellW / 2 + Phaser.Math.Between(-18, 18),
        y: FIELD.top + Math.floor(i / columns) * cellH + cellH / 2 + Phaser.Math.Between(-14, 14),
      });
    }
    return Phaser.Utils.Array.Shuffle(cells).slice(0, count);
  }

  addBubble(letterId, spot, index) {
    const colour = familyColor(lettersById.get(letterId).shapeFamily);
    const bubble = this.add.container(spot.x, spot.y);
    bubble.letterId = letterId;
    bubble.popped = false;

    const skin = this.add.graphics();
    skin.fillStyle(COLORS.shadow, 0.18);
    skin.fillCircle(0, 7, BUBBLE / 2);
    skin.fillStyle(colour, 1);
    skin.fillCircle(0, 0, BUBBLE / 2);
    // A highlight, so it reads as a bubble rather than a disc.
    skin.fillStyle(0xffffff, 0.42);
    skin.fillEllipse(-BUBBLE / 5, -BUBBLE / 4, BUBBLE / 3.4, BUBBLE / 5);
    bubble.add(skin);

    bubble.add(
      addGlyph(
        this,
        0,
        0,
        `in-order:em${Math.round(this.fit.em)}:${letterId}`,
        letterGlyph(letterId, 'isolated'),
        { em: this.fit.em, color: COLORS.onColor }
      )
    );

    bubble.setSize(BUBBLE, BUBBLE);
    bubble.setInteractive({ useHandCursor: true });
    bubble.on('pointerdown', () => squash(this, bubble));
    bubble.on('pointerup', () => this.tap(bubble));

    this.field.add(bubble);
    this.bubbles.push(bubble);
    popIn(this, bubble, { delay: index * 80, duration: 300 });
    this.time.delayedCall(index * 80 + 40, () => sfx.boing());
    this.time.delayedCall(index * 80 + 340, () => {
      if (bubble.active) bubble.idle = bob(this, bubble, { distance: 5, duration: 2400 });
    });
  }

  // ------------------------------------------------------------------- play

  tap(bubble) {
    if (this.locked || bubble.popped) return;

    if (bubble.letterId !== this.run[this.next]) {
      wrongAnswer();
      this.plant?.wonder();
      // It stays. Working through the bubbles until one gives is how a child
      // finds out what "next" means, and it must not cost them the board.
      this.tweens.add({
        targets: bubble,
        x: bubble.x + 9,
        duration: 60,
        yoyo: true,
        repeat: 2,
        ease: 'Sine.easeInOut',
      });
      return;
    }

    bubble.popped = true;
    bubble.disableInteractive();
    bubble.idle?.stop();
    rightAnswer();
    sfx.pop();
    popPuff(this, bubble.x, bubble.y, familyColor(lettersById.get(bubble.letterId).shapeFamily));
    sparkleBurst(this, bubble.x, bubble.y, { count: 20 });
    sayLetter(bubble.letterId, { word: false });

    this.addToTrail(bubble.letterId, this.next);
    this.next++;
    this.tweens.add({
      targets: bubble,
      scaleX: 0,
      scaleY: 0,
      alpha: 0,
      duration: 220,
      ease: 'Back.easeIn',
    });

    if (this.next < this.run.length) return;

    this.locked = true;
    finished();
    sayLetters(this.run);
    this.time.delayedCall(700, () => {
      wellDone(this, this.stage, { duration: 2400 });
      this.round++;
      this.time.delayedCall(2200, () => this.newRound());
    });
  }

  /**
   * The run so far, building along the bottom right to left.
   *
   * This is the whole reward structure of the screen: the row that appears is
   * the order, in order, made by them.
   */
  addToTrail(letterId, index) {
    const step = 104;
    const startX = DESIGN.width / 2 + ((this.run.length - 1) * step) / 2;
    const chip = this.add.container(startX - index * step, TRAIL_Y);

    const plate = this.add.graphics();
    plate.fillStyle(COLORS.card, 1);
    plate.fillRoundedRect(-44, -44, 88, 88, 16);
    plate.lineStyle(4, COLORS.correct, 1);
    plate.strokeRoundedRect(-44, -44, 88, 88, 16);
    chip.add(plate);
    chip.add(
      addGlyph(
        this,
        0,
        0,
        `in-order-trail:em${Math.round(this.fit.em * 0.7)}:${letterId}`,
        letterGlyph(letterId, 'isolated'),
        { em: this.fit.em * 0.7, color: COLORS.ink }
      )
    );

    this.trail.add(chip);
    popIn(this, chip, { duration: 260 });
    hop(this, chip, { height: 12 });
  }
}
