import Phaser from 'phaser';
import {
  activeWords,
  inPlay,
  allLetterGlyphs,
  letterGlyph,
  lettersById,
  wordsById,
} from '../lib/content.js';
import { addGlyph, fitEmAlone } from '../lib/glyph.js';
import * as sfx from '../lib/sfx.js';
import { milestone, rightAnswer, wrongAnswer } from '../lib/flourish.js';
import { queueBackdrop } from '../lib/backdrops.js';
import { addWordImage, hasWordImage, queueWordImages } from '../lib/images.js';
import { addStage, wellDone } from '../lib/stage.js';
import { sway } from '../lib/liveliness.js';
import { popPuff, sparkleBurst } from '../lib/particles.js';
import { sayLetter, sayWord } from '../lib/say.js';
import { COLORS, DESIGN, RAIL_EDGE, familyColor, label } from '../lib/theme.js';
import { pickWeighted } from '../lib/mastery.js';

/**
 * Catch the letter that starts the word.
 *
 * ## The same pairing as StartsWith, asked the other way round
 *
 * StartsWith shows a letter and asks which picture begins with it. This shows
 * the picture and asks which letter it begins with, and that is not the same
 * exercise: going letter-to-word is remembering an example you were taught,
 * going word-to-letter is working out a sound and finding a shape for it. The
 * second is the one that turns into spelling.
 *
 * ## And the answers swim
 *
 * Fish cross the pond, so the choice is made against a moving target — the same
 * reason Balloons exists alongside FindLetter. The difference from Balloons is
 * the direction and the pace: fish cross sideways and steadily, and a child can
 * wait for one to come round again, where a balloon leaves the top for good.
 * Nothing is ever lost by waiting.
 */

/** Time for a fish to cross the pond, by streak. Never fast. */
const CROSS_MS = [13000, 12000, 11000, 10000];
const FISH = 5;
/**
 * The water fish are allowed into.
 *
 * Kept below the ribbon and clear of the bottom edge. The backdrop is
 * underwater from top to bottom precisely so this band can be generous — an
 * earlier version painted a pond with a horizon in it, and half the fish swam
 * through the sky.
 */
const POND = { top: 300, bottom: DESIGN.height - 90, left: -140, right: DESIGN.width + 140 };

export default class Fishing extends Phaser.Scene {
  constructor() {
    super('Fishing');
    /** @type {string[]} letters that have an illustrated word beginning with them */
    this.pool = [];
    /** letterId -> wordId */
    this.wordFor = new Map();
    this.streak = 0;
    /** @type {string|null} */
    this.target = null;
    /** @type {Phaser.GameObjects.Container[]} */
    this.fish = [];
    this.locked = false;
  }

  preload() {
    queueBackdrop(this);
    queueWordImages(this);
  }

  create() {
    const lettersInPlay = inPlay.letters();
    for (const word of activeWords()) {
      // Only words the letter actually begins — the same rule as StartsWith,
      // and for the same reason: ڑ, ھ and ی never start a word.
      if (word.letterIndex !== 0) continue;
      if (!word.letter || !letterGlyph(word.letter) || !hasWordImage(word.id)) continue;
      // The word being in play is not enough: this pairs a *letter* with a
      // picture, so a letter switched off individually has to drop out even
      // where the word teaching it is still on.
      if (!lettersInPlay.has(word.letter)) continue;
      if (!this.wordFor.has(word.letter)) this.wordFor.set(word.letter, word.id);
    }
    this.pool = [...this.wordFor.keys()];
    this.streak = 0;
    this.fish = [];

    this.stage = addStage(this, {
      hills: false,
      instruction: 'catch-letter',
      roman: 'Catch the letter',
    });
    this.banner = this.stage.banner;
    this.rail = this.stage.rail;

    this.fishFit = fitEmAlone(allLetterGlyphs('isolated'), 92, 76);
    // The word being asked about, in the corner where every screen here puts
    // its question.
    this.promptLayer = this.add.container(RAIL_EDGE + 96, 190).setDepth(21);

    this.newRound();
  }

  // ------------------------------------------------------------------ round

  newRound() {
    this.locked = false;
    for (const fish of [...this.fish]) this.remove(fish);

    this.target = pickWeighted('letter', this.pool, { avoid: [this.target] });

    this.banner?.setInstruction('catch-letter', 'Catch the letter');
    this.buildPrompt();
    this.updateStreak();
    this.speak();

    // The pond starts full and spread across it, rather than making a child
    // watch an empty pond while the first fish swims in.
    const others = Phaser.Utils.Array.Shuffle(
      this.pool.filter((id) => id !== this.target)
    ).slice(0, FISH - 1);
    const order = Phaser.Utils.Array.Shuffle([this.target, ...others]);
    order.forEach((id, i) => {
      this.launch(id, POND.left + ((POND.right - POND.left) * (i + 0.5)) / order.length);
    });
  }

  /** The picture of the word, tappable to hear it again. */
  buildPrompt() {
    this.promptLayer.removeAll(true);
    const wordId = this.wordFor.get(this.target);
    const word = wordsById.get(wordId);

    const card = this.add.container(0, 0);
    const plate = this.add.graphics();
    plate.fillStyle(COLORS.shadow, 0.18);
    plate.fillRoundedRect(-92, -76, 184, 164, 22);
    plate.fillStyle(COLORS.card, 1);
    plate.fillRoundedRect(-92, -82, 184, 164, 22);
    plate.lineStyle(5, COLORS.accent, 1);
    plate.strokeRoundedRect(-92, -82, 184, 164, 22);
    card.add(plate);

    const picture = addWordImage(this, 0, -16, wordId, 124);
    if (picture) card.add(picture);
    card.add(label(this, 0, 58, word.roman, { size: 15 }));

    card.setSize(184, 164);
    card.setInteractive({ useHandCursor: true });
    card.on('pointerup', () => this.speak());
    this.promptLayer.add(card);
  }

  /** The word, never the letter: naming the letter would be the answer. */
  speak() {
    sayWord(this.wordFor.get(this.target));
  }

  updateStreak() {
  }

  // ------------------------------------------------------------------- fish

  launch(letterId, startX) {
    const letter = lettersById.get(letterId);
    const colour = familyColor(letter.shapeFamily);
    const y = Phaser.Math.Between(POND.top, POND.bottom);
    const rightwards = Math.random() < 0.5;

    const fish = this.add.container(startX, y).setDepth(10);
    fish.letterId = letterId;

    const body = this.add.graphics();
    // A rounded body with a triangular tail, drawn towards -x; the container is
    // flipped by scaleX for the ones swimming the other way.
    body.fillStyle(COLORS.shadow, 0.16);
    body.fillEllipse(4, 8, 132, 84);
    body.fillStyle(colour, 1);
    body.fillEllipse(0, 0, 132, 84);
    body.fillTriangle(58, 0, 96, -32, 96, 32);
    body.fillStyle(0xffffff, 0.9);
    body.fillCircle(-40, -16, 11);
    body.fillStyle(COLORS.outline, 1);
    body.fillCircle(-43, -16, 5);
    fish.add(body);

    fish.add(
      addGlyph(
        this,
        6,
        2,
        `fishing:em${Math.round(this.fishFit.em)}:${letterId}`,
        letterGlyph(letterId, 'isolated'),
        { em: this.fishFit.em, color: COLORS.onColor }
      )
    );

    fish.setScale(rightwards ? -1 : 1, 1);
    fish.setSize(150, 90);
    fish.setInteractive({ useHandCursor: true });
    fish.on('pointerup', () => this.catchFish(fish));

    this.fish.push(fish);
    this.swim(fish, rightwards);
    // A slow rise and fall, so a fish is swimming rather than sliding.
    sway(this, fish, { distance: 12, duration: 2600 + Math.random() * 800 });
    return fish;
  }

  /**
   * Sends a fish across, and round again from the other side.
   *
   * Recycled rather than removed: the answer must never leave the pond. A child
   * who was still looking at the picture when the right fish swam off would be
   * stuck with a round they cannot win.
   */
  swim(fish, rightwards) {
    const speed = CROSS_MS[Math.min(this.streak, CROSS_MS.length - 1)];
    const to = rightwards ? POND.right : POND.left;
    const distance = Math.abs(to - fish.x);
    fish.trip = this.tweens.add({
      targets: fish,
      x: to,
      duration: speed * (distance / (POND.right - POND.left)),
      onComplete: () => {
        if (!fish.active) return;
        fish.setX(rightwards ? POND.left : POND.right);
        fish.setY(Phaser.Math.Between(POND.top, POND.bottom));
        this.swim(fish, rightwards);
      },
    });
  }

  remove(fish) {
    fish.trip?.stop();
    this.tweens.killTweensOf(fish);
    this.fish = this.fish.filter((f) => f !== fish);
    fish.destroy();
  }

  catchFish(fish) {
    if (this.locked || !fish.active) return;

    if (fish.letterId !== this.target) {
      wrongAnswer({ subject: { kind: 'letter', id: this.target } });
      this.rail?.wonder();
      // It wriggles and swims on. Nothing is lost — the streak is only broken
      // by giving up, and there is no way to give up here.
      this.tweens.add({
        targets: fish,
        y: fish.y + 14,
        duration: 70,
        yoyo: true,
        repeat: 2,
        ease: 'Sine.easeInOut',
      });
      this.streak = 0;
      this.updateStreak();
      return;
    }

    this.locked = true;
    rightAnswer({ kind: 'letter', id: this.target });
    sfx.pop();
    this.streak++;
    popPuff(this, fish.x, fish.y, familyColor(lettersById.get(fish.letterId).shapeFamily));
    sparkleBurst(this, fish.x, fish.y, { count: 26 });
    this.rail?.cheer();
    this.remove(fish);
    this.updateStreak();
    // Now the letter can be named, next to the word it starts.
    sayLetter(this.target);

    if (this.streak % 5 === 0) {
      milestone();
      wellDone(this, this.stage);
    }

    for (const other of this.fish) {
      this.tweens.add({ targets: other, alpha: 0, duration: 420 });
    }
    this.time.delayedCall(1000, () => this.newRound());
  }
}
