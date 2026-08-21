import Phaser from 'phaser';
import {
  activeLetters,
  allLetterGlyphs,
  letterGlyph,
  lettersById,
  wordForLetter,
} from '../lib/content.js';
import { addGlyph, fitEmAlone } from '../lib/glyph.js';
import * as sfx from '../lib/sfx.js';
import { finished, rightAnswer, wrongAnswer } from '../lib/flourish.js';
import { dance } from '../lib/celebrate.js';
import { queueBackdrop } from '../lib/backdrops.js';
import { addWordImage, hasWordImage, queueWordImages } from '../lib/images.js';
import { addStage, wellDone } from '../lib/stage.js';
import { hop, popIn } from '../lib/liveliness.js';
import { sparkleBurst } from '../lib/particles.js';
import { sayLetter } from '../lib/say.js';
import { COLORS, DESIGN, familyColor, label } from '../lib/theme.js';
import { pickSomeWeighted } from '../lib/mastery.js';

/**
 * Draw a line from each letter to its picture.
 *
 * ## Why this and Pairs and Shapes are three games, not one
 *
 * All three are about matching, and they ask for three different things:
 *
 *   - **Pairs (Memory)** hides the cards. The work is remembering where a
 *     thing was.
 *   - **Shapes (JoinForms)** shows everything and pairs a letter with itself
 *     wearing another face. The work is seeing through the disguise.
 *   - **This** shows everything and pairs a letter with its *meaning*. The
 *     work is knowing what ب gives you, with nothing hidden and nothing to
 *     see through.
 *
 * With nothing hidden and no disguise, it is the easiest of the three, and it
 * is the one to meet first.
 *
 * ## Drawn, not tapped
 *
 * The line follows the finger from the letter to the picture and stays there
 * when it lands. Tapping twice would do the same job — Shapes does exactly
 * that — but the drawn line is the point here: at the end of the round the
 * screen shows every pairing at once as a set of threads, which is a picture of
 * what was learned rather than a score.
 *
 * A line let go anywhere but on a picture simply vanishes. Nothing is wrong,
 * nothing is counted, and the letter is still there to try again.
 */

/** Pairs on the board, by how many boards have been finished. */
const PAIRS_BY_ROUND = [3, 3, 4, 4, 5];

const CARD = 116;
/** The two columns: letters on the right, pictures on the left. */
const RIGHT_X = DESIGN.width - 190;
const LEFT_X = 470;
const BAND = { top: 210, bottom: DESIGN.height - 70 };

export default class ConnectPairs extends Phaser.Scene {
  constructor() {
    super('ConnectPairs');
    /** @type {string[]} letters with an illustrated word */
    this.pool = [];
    this.round = 0;
    this.joined = 0;
    /** The letter card the finger is currently dragging from. */
    this.from = null;
    this.locked = false;
  }

  preload() {
    queueBackdrop(this);
    queueWordImages(this);
  }

  create() {
    this.pool = activeLetters()
      .map((letter) => letter.id)
      .filter((id) => {
        const word = wordForLetter(id);
        return letterGlyph(id) && word && hasWordImage(word.id);
      });
    this.round = 0;

    this.stage = addStage(this, {
      instruction: 'join-picture',
      roman: 'Join each letter to its picture',
    });
    this.banner = this.stage.banner;
    this.rail = this.stage.rail;

    // Threads under the cards, and the line being drawn above them so it is
    // visible while it crosses one.
    this.threads = this.add.graphics().setDepth(-1);
    this.drawing = this.add.graphics().setDepth(25);
    this.board = this.add.container(0, 0);

    this.input.on('pointermove', (pointer) => this.dragTo(pointer));
    this.input.on('pointerup', (pointer) => this.release(pointer));

    this.newBoard();
  }

  // ------------------------------------------------------------------ board

  newBoard() {
    this.board.removeAll(true);
    this.threads.clear();
    this.drawing.clear();
    this.letters = [];
    this.pictures = [];
    this.joined = 0;
    this.from = null;
    this.locked = false;
    this.banner.setInstruction('join-picture', 'Join each letter to its picture');

    const count = Math.min(
      PAIRS_BY_ROUND[Math.min(this.round, PAIRS_BY_ROUND.length - 1)],
      this.pool.length
    );
    const ids = pickSomeWeighted('letter', this.pool, count);
    const em = fitEmAlone(allLetterGlyphs('isolated'), CARD - 40, CARD - 44).em;

    const spread = (n, i) =>
      BAND.top + ((BAND.bottom - BAND.top) * (i + 0.5)) / n;

    // Each column shuffled separately, and then the pictures shuffled again
    // until no picture sits opposite its own letter. Two independent shuffles
    // is the obvious way to write this and it is not enough: with three pairs
    // they land in the same order one board in six, and that board can be
    // solved by drawing three straight lines across without looking at
    // anything. A derangement costs a couple of retries and removes the case.
    const left = Phaser.Utils.Array.Shuffle([...ids]);
    const right = Phaser.Utils.Array.Shuffle([...ids]);
    if (count > 1) {
      while (left.some((id, i) => id === right[i])) Phaser.Utils.Array.Shuffle(right);
    }

    left.forEach((id, i) => {
      this.letters.push(this.addLetter(id, RIGHT_X, spread(count, i), em, i));
    });
    right.forEach((id, i) => {
      this.pictures.push(this.addPicture(id, LEFT_X, spread(count, i), i));
    });
  }

  addLetter(letterId, x, y, em, index) {
    const colour = familyColor(lettersById.get(letterId).shapeFamily);
    const card = this.add.container(x, y);
    card.letterId = letterId;
    card.joined = false;

    const plate = this.add.graphics();
    plate.fillStyle(COLORS.shadow, 0.2);
    plate.fillRoundedRect(-CARD / 2, -CARD / 2 + 6, CARD, CARD, 20);
    plate.fillStyle(COLORS.card, 1);
    plate.fillRoundedRect(-CARD / 2, -CARD / 2, CARD, CARD, 20);
    plate.lineStyle(4, colour, 1);
    plate.strokeRoundedRect(-CARD / 2, -CARD / 2, CARD, CARD, 20);
    card.add(plate);
    card.plate = plate;
    card.colour = colour;

    card.add(
      addGlyph(
        this,
        0,
        0,
        `connect:em${Math.round(em)}:${letterId}`,
        letterGlyph(letterId, 'isolated'),
        { em, color: COLORS.ink }
      )
    );

    card.setSize(CARD, CARD);
    card.setInteractive({ useHandCursor: true });
    card.on('pointerdown', () => this.begin(card));
    this.board.add(card);
    popIn(this, card, { delay: index * 70, duration: 280 });
    return card;
  }

  addPicture(letterId, x, y, index) {
    const word = wordForLetter(letterId);
    const card = this.add.container(x, y);
    card.letterId = letterId;
    card.joined = false;

    const plate = this.add.graphics();
    plate.fillStyle(COLORS.shadow, 0.2);
    plate.fillRoundedRect(-CARD / 2, -CARD / 2 + 6, CARD, CARD, 20);
    plate.fillStyle(COLORS.card, 1);
    plate.fillRoundedRect(-CARD / 2, -CARD / 2, CARD, CARD, 20);
    plate.lineStyle(4, COLORS.outline, 0.25);
    plate.strokeRoundedRect(-CARD / 2, -CARD / 2, CARD, CARD, 20);
    card.add(plate);
    card.plate = plate;

    const picture = addWordImage(this, 0, -8, word.id, CARD - 30);
    if (picture) card.add(picture);
    card.add(label(this, 0, CARD / 2 - 16, word.roman, { size: 13 }));

    card.setSize(CARD, CARD);
    card.setInteractive({ useHandCursor: true });
    this.board.add(card);
    popIn(this, card, { delay: index * 70 + 40, duration: 280 });
    return card;
  }

  // ------------------------------------------------------------------- play

  begin(card) {
    if (this.locked || card.joined) return;
    this.from = card;
    sfx.tap();
    // Named as it is picked up. Hearing "bay" while looking for the goat is the
    // whole lesson, and it is free here because nothing is hidden.
    sayLetter(card.letterId, { word: false });
  }

  dragTo(pointer) {
    this.drawing.clear();
    if (!this.from) return;
    this.drawing.lineStyle(7, this.from.colour, 0.85);
    this.drawing.lineBetween(this.from.x, this.from.y, pointer.worldX, pointer.worldY);
  }

  release(pointer) {
    this.drawing.clear();
    const from = this.from;
    this.from = null;
    if (!from || this.locked) return;

    const onto = this.pictures.find(
      (card) =>
        !card.joined &&
        Math.abs(pointer.worldX - card.x) < CARD * 0.8 &&
        Math.abs(pointer.worldY - card.y) < CARD * 0.8
    );

    // Let go in mid-air, or on a picture already joined. The line simply is not
    // there any more; nothing is marked and nothing is counted.
    if (!onto) return;

    if (onto.letterId !== from.letterId) {
      wrongAnswer({ subject: { kind: 'letter', id: from.letterId } });
      this.rail?.wonder();
      for (const card of [from, onto]) {
        this.tweens.add({
          targets: card,
          x: card.x + 8,
          duration: 60,
          yoyo: true,
          repeat: 2,
          ease: 'Sine.easeInOut',
        });
      }
      return;
    }

    this.join(from, onto);
  }

  join(from, onto) {
    from.joined = true;
    onto.joined = true;
    from.disableInteractive();
    onto.disableInteractive();
    this.joined++;
    rightAnswer({ kind: 'letter', id: from.letterId });
    sfx.sparkle();

    // The thread stays. By the end the board is a picture of every pairing at
    // once, which is worth more than a number.
    this.threads.lineStyle(7, from.colour, 0.55);
    this.threads.lineBetween(from.x, from.y, onto.x, onto.y);

    for (const card of [from, onto]) {
      card.plate.lineStyle(6, COLORS.correct, 1);
      card.plate.strokeRoundedRect(-CARD / 2, -CARD / 2, CARD, CARD, 20);
      sparkleBurst(this, card.x, card.y, { count: 16, tint: [COLORS.correct, 0xffffff] });
      hop(this, card, { height: 14 });
      dance(this, card);
    }

    // Now the word, because the picture of it has just been found.
    sayLetter(from.letterId);

    if (this.joined < this.letters.length) return;

    this.locked = true;
    finished();
    this.time.delayedCall(700, () => {
      wellDone(this, this.stage, { duration: 2600 });
      this.round++;
      this.time.delayedCall(2200, () => this.newBoard());
    });
  }
}
