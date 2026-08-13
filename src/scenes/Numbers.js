import Phaser from 'phaser';
import { allNumberGlyphs, numberGlyph, numbers, numbersById } from '../lib/content.js';
import { addGlyph, fitEmAlone } from '../lib/glyph.js';
import { hop } from '../lib/liveliness.js';
import { ringBurst } from '../lib/particles.js';
import * as sfx from '../lib/sfx.js';
import { clipKeys, hasClip } from '../lib/audio.js';
import { addWordImage, illustratedWords, queueWordImages } from '../lib/images.js';
import { sayNumber } from '../lib/say.js';
import { COLORS, chunkyGlyphEm, label } from '../lib/theme.js';
import QuizScene from './QuizScene.js';

/** Star colours, cycled by value so the same digit is always the same colour. */
const STAR_COLORS = [0xe4633c, 0x3f74d6, 0x2fa05f, 0xd44f8c, 0x9b5fc9, 0xe09a1c, 0x1a9c96];

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
    this.instruction = 'how-many';
    this.instructionRoman = 'How many?';
    // Stars here and nowhere else: an Urdu numeral is compact enough to sit
    // comfortably in the thin middle of one, which is exactly what a letter is
    // not.
    this.tileShape = 'star';
    this.tileSize = 200;
    this.tileGap = 8;
    this.choicesY = 540;
    this.promptY = 258;
    /** @type {string[]} */
    this.countable = [];
    /** @type {string[]} */
    this.props = [];
  }

  preload() {
    super.preload();
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

        // Each one can be poked, and each poke counts it out loud: one, two,
        // three. This is the actual skill the game is about — a three-year-old
        // counts by touching things, one at a time, and a screen where the
        // things cannot be touched is asking them to count in their head.
        //
        // Nothing is scored and nothing can go wrong. Tapping them in a silly
        // order, or the same one eight times, is allowed; the point is the
        // pairing of one touch with one number.
        const ordinal = i + 1;
        image.setInteractive({ useHandCursor: true });
        image.on('pointerdown', () => {
          if (this.locked) return;
          hop(this, image, { height: 18, duration: 190 });
          ringBurst(this, image.x + layer.x, image.y + layer.y, COLORS.accent);
          sfx.tap();
          this.countAloud(ordinal);
        });
      } else {
        const dot = this.add.graphics();
        dot.fillStyle(COLORS.accent, 1);
        dot.fillCircle(x, y, size / 2.6);
        layer.add(dot);
      }
    }

    if (hasClip(clipKeys.number(target))) layer.add(this.speakerIcon(410));
  }

  /** One hue per digit, so a star is a colour before it is a number. */
  tileColor(id) {
    return STAR_COLORS[numbersById.get(id).value % STAR_COLORS.length];
  }

  decorateTile(tile, id, size) {
    const glyph = numberGlyph(id);
    if (glyph) {
      // One em across all ten numerals. Fitted to a height instead, ۱ — a bare
      // upright stroke — was drawn nearly twice the size of ۴, so the choices
      // looked like answers of different importance.
      //
      // Sat above the star's middle: a star is widest above its centre, and a
      // numeral any lower hangs into the bottom notch.
      const fit = fitEmAlone(allNumberGlyphs(), size * 0.5, size * 0.44);
      tile.add(
        addGlyph(this, 0, -18, `number-choice:em${Math.round(fit.em)}:${id}`, glyph,
          chunkyGlyphEm(fit.em))
      );
    }
    // The Latin numeral underneath, small: it is for the parent counting along,
    // and for a child who meets 4 and ۴ in the same week.
    tile.add(
      label(this, 0, 34, String(numbersById.get(id).value), {
        size: 18,
        color: COLORS.onColorDim,
      })
    );
  }

  speak() {
    sayNumber(this.target);
  }

  /**
   * Says a number as one of the objects is touched.
   *
   * Interrupts whatever was already speaking, because a child tapping quickly
   * along a row wants one number per tap — queueing them would run the count
   * on long after they had finished, and the whole value of this is that the
   * sound lands with the finger.
   *
   * Silent if that number has not been recorded yet, like everything else here.
   */
  countAloud(value) {
    const number = numbers.find((n) => n.value === value);
    if (number) sayNumber(number.id);
  }
}
