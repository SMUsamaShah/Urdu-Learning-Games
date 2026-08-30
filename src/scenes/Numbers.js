import Phaser from 'phaser';
import {
  activeNumbers,
  allNumberGlyphs,
  inPlay,
  numberGlyph,
  numbersById,
} from '../lib/content.js';
import { addGlyph, fitEmAlone } from '../lib/glyph.js';
import { hop, popIn } from '../lib/liveliness.js';
import { ringBurst } from '../lib/particles.js';
import * as sfx from '../lib/sfx.js';
import { clipKeys, hasClip } from '../lib/audio.js';
import { addWordImage, illustratedWords, queueWordImages } from '../lib/images.js';
import { sayNumber } from '../lib/say.js';
import { COLORS, chunkyGlyphEm, label } from '../lib/theme.js';
import QuizScene from './QuizScene.js';
import { pickWeighted } from '../lib/mastery.js';

/* The most things a round will ever lay out to be counted. */
const COUNTABLE_MAX = 9;

/* Star colours, cycled by value so the same digit is always the same colour. */
const STAR_COLORS = [0xe4633c, 0x3f74d6, 0x2fa05f, 0xd44f8c, 0x9b5fc9, 0xe09a1c, 0x1a9c96];

/* Count the things, then pick the number. */
export default class Numbers extends QuizScene {
  constructor() {
    super('Numbers');
    this.instruction = 'how-many';
    this.instructionRoman = 'How many?';
    this.subjectKind = 'number';
    // Stars here and nowhere else.
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
    // Zero is left out: an empty screen is not a counting question, and "how many?" with nothing there reads as a bug.
    this.countable = activeNumbers()
      .filter((n) => n.value >= 1 && n.value <= COUNTABLE_MAX)
      .map((n) => n.id);
    // The things laid out to be counted are the word pictures.
    const shown = inPlay.words();
    this.props = illustratedWords().filter((id) => shown.has(id));
  }

  pickTarget(previous) {
    return pickWeighted('number', this.countable, { avoid: [previous] });
  }

  lineUpFor(target, count) {
    const value = numbersById.get(target).value;
    // Nearest first, so two choices means "is it 4 or 5?" rather than an easy pair, and a wider line-up still stays around.
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

    // The group fills roughly the same area whatever the count, so one apple is a big apple and nine are small ones.
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
        popIn(this, image, { delay: i * 70, duration: 260 });

        // Each one can be poked, and each poke counts it out loud: one, two, three.
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

  /* One hue per digit, so a star is a colour before it is a number. */
  tileColor(id) {
    return STAR_COLORS[numbersById.get(id).value % STAR_COLORS.length];
  }

  decorateTile(tile, id, size) {
    const glyph = numberGlyph(id);
    if (glyph) {
      // One em across all ten numerals.
      const fit = fitEmAlone(allNumberGlyphs(), size * 0.5, size * 0.44);
      tile.add(
        addGlyph(this, 0, -18, `number-choice:em${Math.round(fit.em)}:${id}`, glyph,
          chunkyGlyphEm(fit.em))
      );
    }
    // The Latin numeral underneath.
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

  /* Says a number as one of the objects is touched. */
  countAloud(value) {
    const number = activeNumbers().find((n) => n.value === value);
    if (number) sayNumber(number.id);
  }
}
