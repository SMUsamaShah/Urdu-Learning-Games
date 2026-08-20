import Phaser from 'phaser';
import {
  allLetterGlyphs,
  allWordGlyphs,
  brokenWord,
  letterGlyph,
  lettersById,
  wordGlyph,
} from '../lib/content.js';
import { addGlyph, fitEmAlone } from '../lib/glyph.js';
import { addWordImage, queueWordImages } from '../lib/images.js';
import { HINT_AFTER_MISSES, pickWord, spellingPlan, trayFor } from '../lib/spelling.js';
import { sayWord } from '../lib/say.js';
import * as sfx from '../lib/sfx.js';
import { finished, rightAnswer, wrongAnswer } from '../lib/flourish.js';
import { dance } from '../lib/celebrate.js';
import { queueBackdrop } from '../lib/backdrops.js';
import { addStage, wellDone } from '../lib/stage.js';
import { armDragging, carry, nearest, refuse, swimHome } from '../lib/dragging.js';
import { bob, hop, popIn } from '../lib/liveliness.js';
import { sparkleBurst } from '../lib/particles.js';
import { COLORS, DESIGN, PLAY, familyColor, makeButton } from '../lib/theme.js';

/**
 * Build the word out of its letters.
 *
 * ## The thing this screen exists to teach
 *
 * A child who knows ب, ک, ر and ی from their flashcards looks at بکری and sees
 * none of them. The typeface has reshaped every one and fused them into a
 * single run, which is what Urdu does and what makes learning to read it
 * different from learning to read English. Recognising letters and reading
 * words are two skills here, not one, and nothing else in this app crosses
 * between them.
 *
 * So: a picture, a row of empty slots, and a tray of the letters in their
 * **isolated** shapes — the shapes the child actually knows. They fill the row
 * right to left, and when the last one lands the isolated letters slide
 * together and become the written word. That last second is the lesson. The
 * rest is the setup for it.
 *
 * ## No word on screen to copy
 *
 * The picture and the spoken word are the question. Showing the answer written
 * out would make this a matching exercise, which is a real thing a child can do
 * and is not this.
 *
 * ## Carried, not tapped
 *
 * The letter is picked up and put in the slot. Tapping would be easier to play
 * and it is a different act: choosing rather than placing, and placing is what
 * this game is about.
 *
 * **A letter dropped on its own slot is accepted whichever slot that is.** The
 * pulse marks the next empty one because reading right to left is the habit
 * being built, but a child who spots the ی at the end and puts it there is
 * right, and a game that refuses them is arguing with somebody who has just
 * understood it.
 *
 * A wrong slot shakes the letter off and it swims home; a drop in mid-air just
 * swims home. Two misses in one round turn the hint on for that round — a child
 * who is stuck should be helped where they are stuck, not on the next round and
 * not in a settings page.
 */

/** A slot in the word being built, and the gap between two of them. */
const SLOT = { size: 118, gap: 14, y: 428 };
const TRAY_Y = DESIGN.height - 112;
const TRAY = { size: 112, gap: 18 };
/** Where the picture sits, and how big. */
const PICTURE = { y: 250, size: 168 };

export default class BuildWord extends Phaser.Scene {
  constructor() {
    super('BuildWord');
    /** @type {string|null} */
    this.wordId = null;
    /** @type {string[]} the letters, in writing order */
    this.letters = [];
    this.filled = 0;
    this.misses = 0;
    this.hinting = false;
    this.locked = false;
    this.round = 0;
  }

  preload() {
    queueBackdrop(this);
    queueWordImages(this);
  }

  create() {
    this.round = 0;
    this.stage = addStage(this, {
      instruction: 'build-word',
      roman: 'Build the word',
    });
    this.banner = this.stage.banner;
    this.rail = this.stage.rail;

    this.board = this.add.container(0, 0);
    this.tray = this.add.container(0, 0);

    armDragging(this, {
      canLift: (tile) => !this.locked && !tile.used,
      onDrop: (tile) => this.drop(tile),
    });

    this.newRound();
  }

  // ------------------------------------------------------------------ round

  newRound(previous = this.wordId) {
    this.board.removeAll(true);
    this.tray.removeAll(true);
    this.filled = 0;
    this.misses = 0;
    this.locked = false;

    const plan = spellingPlan();
    const word = pickWord(previous);
    this.wordId = word.id;
    this.letters = brokenWord(word.id);
    this.hinting = plan.hint;

    this.buildPicture(word);
    this.buildSlots();
    this.buildTray(trayFor(word.id, plan.spare));
    this.markNext();

    // Said, not written. The picture is what is on screen; the word is what is
    // in the air. Between them they are the question.
    this.time.delayedCall(420, () => sayWord(word.id));
  }

  buildPicture(word) {
    const plate = this.add.graphics();
    plate.fillStyle(COLORS.shadow, 0.16);
    plate.fillRoundedRect(PLAY.centerX - 118, PICTURE.y - 100, 236, 208, 28);
    plate.fillStyle(COLORS.panel, 1);
    plate.fillRoundedRect(PLAY.centerX - 118, PICTURE.y - 108, 236, 208, 28);
    this.board.add(plate);

    const picture = addWordImage(this, PLAY.centerX, PICTURE.y, word.id, PICTURE.size);
    if (picture) this.board.add(picture);
    else if (word.emoji) {
      this.board.add(
        this.add.text(PLAY.centerX, PICTURE.y, word.emoji, { fontSize: '112px' }).setOrigin(0.5)
      );
    }
    this.picture = picture ?? null;

    // Tapping the picture says the word again. The only help on the screen, and
    // it is the same help a parent gives: say it once more.
    const zone = this.add.zone(PLAY.centerX, PICTURE.y, 236, 208).setOrigin(0.5);
    zone.setInteractive({ useHandCursor: true });
    zone.on('pointerup', () => {
      if (this.picture?.active) hop(this, this.picture, { height: 14 });
      sayWord(this.wordId);
    });
    this.board.add(zone);
  }

  /** The em every slot and every tray tile is drawn at. Measured once, across
   *  the whole alphabet, so a ہ is not three times the size of a ل. */
  get letterEm() {
    return fitEmAlone(allLetterGlyphs('isolated'), SLOT.size - 34, SLOT.size - 34).em;
  }

  buildSlots() {
    const step = SLOT.size + SLOT.gap;
    const width = this.letters.length * step - SLOT.gap;
    // Right to left: the first letter of the word is the rightmost slot.
    const right = PLAY.centerX + width / 2 - SLOT.size / 2;
    const em = this.letterEm;

    this.slots = this.letters.map((id, index) => {
      const slot = this.add.container(right - index * step, SLOT.y);
      slot.index = index;
      slot.letterId = id;
      slot.plate = this.add.graphics();
      slot.add(slot.plate);
      this.board.add(slot);
      this.paintSlot(slot, false, em);
      popIn(this, slot, { delay: 180 + index * 70, duration: 260 });
      return slot;
    });
  }

  /**
   * One slot: empty, empty-and-wanted, or filled.
   *
   * The hint is drawn here rather than as a separate object so that turning it
   * on mid-round is one repaint. What it draws is the letter at a fifth alpha —
   * enough to match a shape against, not enough to read from across the room,
   * which is the difference between a hint and the answer.
   */
  paintSlot(slot, wanted, em) {
    slot.plate.clear();
    const half = SLOT.size / 2;
    const filled = Boolean(slot.filledWith);

    slot.plate.fillStyle(COLORS.shadow, 0.14);
    slot.plate.fillRoundedRect(-half, -half + 6, SLOT.size, SLOT.size, 20);
    slot.plate.fillStyle(filled ? COLORS.card : 0xffffff, filled ? 1 : 0.82);
    slot.plate.fillRoundedRect(-half, -half, SLOT.size, SLOT.size, 20);
    slot.plate.lineStyle(
      wanted ? 7 : 4,
      wanted ? COLORS.accent : COLORS.outline,
      wanted ? 1 : 0.4
    );
    slot.plate.strokeRoundedRect(-half + 2, -half + 2, SLOT.size - 4, SLOT.size - 4, 18);

    slot.glyph?.destroy();
    slot.glyph = null;
    const glyph = letterGlyph(slot.letterId, 'isolated');
    if (!glyph) return;

    if (filled) {
      slot.glyph = addGlyph(
        this,
        0,
        0,
        `build-slot:em${Math.round(em)}:${slot.letterId}`,
        glyph,
        { em, color: COLORS.ink }
      );
      slot.add(slot.glyph);
    } else if (this.hinting) {
      slot.glyph = addGlyph(
        this,
        0,
        0,
        `build-hint:em${Math.round(em)}:${slot.letterId}`,
        glyph,
        { em, color: COLORS.ink }
      );
      // Faint, but not so faint it needs looking for. A hint a child has to
      // hunt for is not helping them, and this one is only shown to a child who
      // is either new or already stuck.
      slot.glyph.setAlpha(0.3);
      slot.add(slot.glyph);
    }

    slot.pulse?.stop();
    slot.setScale(1);
    if (wanted && !filled) slot.pulse = bob(this, slot, { distance: 5, duration: 1100 });
  }

  buildTray(ids) {
    const step = TRAY.size + TRAY.gap;
    const startX = PLAY.centerX + ((ids.length - 1) * step) / 2;
    const em = this.letterEm;

    ids.forEach((id, index) => {
      const tile = makeButton(this, {
        x: startX - index * step,
        y: TRAY_Y,
        width: TRAY.size,
        height: TRAY.size,
        // Its shape family's colour, the same one the letter wears everywhere
        // else in the app. Two letters of one family in the tray is a real
        // question — ب and ت differ only by their dots — and colouring them
        // alike is the honest way to say so.
        color: familyColor(lettersById.get(id)?.shapeFamily),
        // No press tween: this one is dragged, and the press would fight the
        // lift. See makeButton.
        press: false,
      });
      tile.letterId = id;
      tile.used = false;
      tile.add(
        addGlyph(this, 0, 0, `build-tray:em${Math.round(em)}:${id}`, letterGlyph(id, 'isolated'), {
          em,
          color: COLORS.onColor,
        })
      );
      this.tray.add(tile);
      popIn(this, tile, { delay: 420 + index * 60, duration: 280 });
      tile.idle = bob(this, tile, { distance: 4, duration: 2200, delay: index * 160 });
      // Armed after popIn, so the home it swims back to is where it settled
      // rather than the scaled-down point it started from.
      this.time.delayedCall(420 + index * 60 + 300, () => carry(this, tile));
    });
  }

  // ------------------------------------------------------------------- play

  /**
   * The slot being asked for: the first empty one, reading right to left.
   *
   * A hint rather than a rule — see the note at the top. Any letter may go into
   * its own slot at any time, and this is only what pulses.
   */
  get nextSlot() {
    return this.slots.find((slot) => !slot.filledWith) ?? null;
  }

  markNext() {
    const em = this.letterEm;
    for (const slot of this.slots) {
      this.paintSlot(slot, slot === this.nextSlot, em);
    }
  }

  /**
   * A letter has been let go somewhere.
   *
   * Three outcomes and none of them costs anything: it lands in its own slot,
   * it is shaken off by the wrong slot, or it was dropped in mid-air and simply
   * goes back to the tray.
   */
  drop(tile) {
    if (this.locked || tile.used) return swimHome(this, tile);

    const empty = this.slots.filter((slot) => !slot.filledWith);
    const slot = nearest(empty, tile);
    if (!slot) return swimHome(this, tile);

    if (tile.letterId !== slot.letterId) {
      wrongAnswer();
      this.rail?.wonder();
      refuse(this, tile, slot);
      // Nothing is taken away and nothing is marked wrong. But being stuck is
      // worth noticing: after the second miss the slots show what goes in them
      // for the rest of this round.
      this.misses++;
      if (this.misses >= HINT_AFTER_MISSES && !this.hinting) {
        this.hinting = true;
        this.markNext();
      }
      return;
    }

    tile.used = true;
    tile.disableInteractive();
    tile.idle?.stop();
    rightAnswer();
    sfx.sparkle();

    // The last few pixels are done for them. A letter that snaps into place
    // rewards a drag that was close enough, which is every drag at this age.
    this.tweens.add({
      targets: tile,
      x: slot.x,
      y: slot.y,
      scale: 0.8,
      alpha: 0,
      duration: 220,
      ease: 'Quad.easeInOut',
      onComplete: () => {
        slot.filledWith = slot.letterId;
        this.paintSlot(slot, false, this.letterEm);
        sparkleBurst(this, slot.x, slot.y, { count: 14, tint: [COLORS.correct, 0xffffff] });
        hop(this, slot, { height: 12 });

        this.filled++;
        if (this.filled < this.slots.length) return this.markNext();
        this.finish();
      },
    });
  }

  /**
   * The word is whole, and the letters become it.
   *
   * The slots slide together into the middle and fade, and the written word
   * fades up in their place at the same size. Two seconds of one thing turning
   * into another, which is the only way to show a child that بکری *is* ب ک ر ی
   * without them being able to read either.
   */
  finish() {
    this.locked = true;
    finished();

    const glyph = wordGlyph(this.wordId);
    const em = fitEmAlone(allWordGlyphs(), 640, 210).em;
    const joined = glyph
      ? addGlyph(this, PLAY.centerX, SLOT.y, `build-word:em${Math.round(em)}:${this.wordId}`, glyph, {
          em,
          color: COLORS.ink,
        })
      : null;
    if (joined) {
      joined.setAlpha(0);
      this.board.add(joined);
    }

    for (const slot of this.slots) {
      slot.pulse?.stop();
      this.tweens.add({
        targets: slot,
        x: PLAY.centerX,
        alpha: 0,
        duration: 460,
        delay: 120,
        ease: 'Quad.easeInOut',
      });
    }
    if (joined) {
      this.tweens.add({ targets: joined, alpha: 1, duration: 420, delay: 380 });
      this.time.delayedCall(520, () => dance(this, joined));
    }

    this.time.delayedCall(700, () => sayWord(this.wordId));
    this.time.delayedCall(1500, () => {
      wellDone(this, this.stage, { duration: 2600 });
      this.round++;
      this.time.delayedCall(2400, () => this.newRound(this.wordId));
    });
  }
}
