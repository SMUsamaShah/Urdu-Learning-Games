import Phaser from 'phaser';
import { numberGlyph, numbers, numbersById } from '../lib/content.js';
import { addGlyph } from '../lib/glyph.js';
import { clipKeys, hasClip, play } from '../lib/audio.js';
import { addWordImage, illustratedWords, queueWordImages } from '../lib/images.js';
import { COLORS, label } from '../lib/theme.js';
import QuizScene from './QuizScene.js';

/**
 * Count the things, then pick the number.
 *
 * Counting comes before numerals: a child can count four apples long before ۴
 * means anything, so the objects are the question and the digit is the answer.
 * Going the other way — showing ۴ and asking which group has four — would test
 * a symbol they have not learned yet.
 *
 * The objects are the word pictures, a different one each round. Recognisable
 * things are easier to count than abstract dots, and it quietly puts the
 * vocabulary in front of the child again.
 *
 * Distractors are the neighbouring numbers. Off-by-one is what counting
 * actually goes wrong by, so a line-up of 3, 4, 5 is the real exercise where a
 * line-up of 4 and 9 would not be.
 */
export default class Numbers extends QuizScene {
  constructor() {
    super('Numbers');
    this.tileSize = 170;
    this.tileGap = 30;
    this.choicesY = 530;
    this.promptY = 250;
    /** @type {string[]} */
    this.countable = [];
    /** @type {string[]} */
    this.props = [];
  }

  preload() {
    queueWordImages(this);
  }

  onCreated() {
    // Zero is left out: an empty screen is not a counting question, and "how
    // many?" with nothing there reads as a bug rather than a puzzle.
    this.countable = numbers.filter((n) => n.value >= 1 && n.value <= 9).map((n) => n.id);
    this.props = illustratedWords();
  }

  pickTarget(previous) {
    return Phaser.Utils.Array.GetRandom(
      this.countable.filter((id) => id !== previous)
    );
  }

  lineUpFor(target, count) {
    const value = numbersById.get(target).value;
    // Nearest first, so two choices means "is it 4 or 5?" rather than an easy
    // pair, and a wider line-up still stays around the answer.
    const neighbours = this.countable
      .filter((id) => id !== target)
      .sort(
        (a, b) =>
          Math.abs(numbersById.get(a).value - value) -
          Math.abs(numbersById.get(b).value - value)
      );

    const near = neighbours.slice(0, Math.max(count + 1, 3));
    const chosen = Phaser.Utils.Array.Shuffle(near).slice(0, count - 1);
    return Phaser.Utils.Array.Shuffle([target, ...chosen]);
  }

  buildPrompt(layer, target) {
    const number = numbersById.get(target);
    const prop = Phaser.Utils.Array.GetRandom(this.props);

    // The group fills roughly the same area whatever the count, so one apple is
    // a big apple and nine are small ones. A fixed size would leave "how many?"
    // asking about a single stamp adrift in an empty screen.
    const perRow = Math.min(number.value, 5);
    const rows = Math.ceil(number.value / 5);
    const step = Math.min(190, 720 / perRow);
    const size = Math.round(step * 0.84) * (rows > 1 ? 0.82 : 1);
    const topY = -((rows - 1) * step * 0.86) / 2 - 10;

    for (let i = 0; i < number.value; i++) {
      const row = Math.floor(i / 5);
      const inRow = Math.min(number.value - row * 5, perRow);
      const indexInRow = i % 5;
      const x = (indexInRow - (inRow - 1) / 2) * step;
      const y = topY + row * step * 0.86;

      const image = addWordImage(this, x, y, prop, size);
      if (image) {
        layer.add(image);
        // A small stagger so they arrive one after another, which invites
        // counting them rather than seeing a block. The scale to return to is
        // whatever setDisplaySize worked out, so it has to be read first.
        const { scaleX, scaleY } = image;
        image.setScale(0);
        this.tweens.add({
          targets: image,
          scaleX,
          scaleY,
          delay: i * 70,
          duration: 260,
          ease: 'Back.easeOut',
        });
      } else {
        const dot = this.add.graphics();
        dot.fillStyle(COLORS.accent, 1);
        dot.fillCircle(x, y, size / 2.6);
        layer.add(dot);
      }
    }

    layer.add(
      label(this, 0, topY + (rows - 1) * step * 0.86 + size / 2 + 26, 'how many?', {
        size: 18,
      })
    );

    if (hasClip(clipKeys.number(target))) {
      const speaker = this.add
        .text(430, 0, '🔊', { fontSize: '46px' })
        .setOrigin(0.5)
        .setInteractive({ useHandCursor: true });
      speaker.on('pointerup', () => this.speak());
      layer.add(speaker);
    }
  }

  tileColor() {
    return COLORS.card;
  }

  decorateTile(tile, id) {
    const glyph = numberGlyph(id);
    if (glyph) {
      tile.add(
        addGlyph(this, 0, -6, `numbers:choice:${id}:96`, glyph, {
          height: 96,
          color: COLORS.accentCss,
        })
      );
    }
    // The Latin numeral underneath, small: it is for the parent counting along,
    // and for a child who meets 4 and ۴ in the same week.
    tile.add(
      label(this, 0, 62, String(numbersById.get(id).value), {
        size: 20,
        color: COLORS.inkDim,
      })
    );
  }

  speak() {
    if (hasClip(clipKeys.number(this.target))) play(clipKeys.number(this.target));
  }
}
