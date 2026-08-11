import Phaser from 'phaser';
import { wordGlyph, wordsById } from '../lib/content.js';
import { addGlyph } from '../lib/glyph.js';
import { clipKeys, hasClip } from '../lib/audio.js';
import { addWordImage, illustratedWords, queueWordImages } from '../lib/images.js';
import { sayWord } from '../lib/say.js';
import { COLORS, label } from '../lib/theme.js';
import QuizScene from './QuizScene.js';

/**
 * Which picture is this word?
 *
 * The first game here that a child can win without knowing any letters, and
 * that is the point: it teaches whole words by shape, the way a reader
 * recognises "the" long before they sound it out. Every word in the app was
 * chosen to teach a letter and is a concrete noun, so each one can be drawn.
 *
 * Distractors are drawn from any illustrated word rather than by similarity —
 * the discrimination being practised is word-to-meaning, and confusable
 * pictures would only add a second puzzle on top of it.
 */
export default class WordPictures extends QuizScene {
  constructor() {
    super('WordPictures');
    this.instruction = 'find-picture';
    this.instructionRoman = 'Find the picture';
    // Cards here rather than a shape: the answers are pictures with their
    // backgrounds cut away, and a picture needs a plain plate behind it to read
    // against. This is the reference apps' memory game, which uses cards too.
    this.tileSize = 200;
    this.tileGap = 30;
    this.choicesY = 505;
    /** @type {string[]} */
    this.pool = [];
  }

  preload() {
    // Small WebPs, and Phaser skips any texture it already holds, so coming
    // back to this screen or stepping across to Numbers costs nothing.
    queueWordImages(this);
  }

  onCreated() {
    this.pool = illustratedWords().filter((id) => wordsById.has(id));
  }

  pickTarget(previous) {
    const pool = this.pool.filter((id) => id !== previous);
    return Phaser.Utils.Array.GetRandom(pool.length ? pool : this.pool);
  }

  lineUpFor(target, count) {
    const others = Phaser.Utils.Array.Shuffle(
      this.pool.filter((id) => id !== target)
    ).slice(0, count - 1);
    return Phaser.Utils.Array.Shuffle([target, ...others]);
  }

  buildPrompt(layer, target) {
    const word = wordsById.get(target);
    const spoken = hasClip(clipKeys.word(target));

    // The word itself is always shown, even when it is also spoken. Unlike the
    // letter games there is nothing to give away — the answer is a picture, so
    // seeing the word is the whole exercise rather than a shortcut past it.
    const plate = this.add.graphics();
    plate.fillStyle(COLORS.card, 1);
    plate.fillRoundedRect(-190, -66, 380, 132, 26);
    layer.add(plate);

    const glyph = wordGlyph(target);
    if (glyph) {
      layer.add(
        addGlyph(this, 0, -4, `words:prompt:${target}:76`, glyph, {
          height: 76,
          color: COLORS.ink,
        })
      );
    }
    layer.add(label(this, 0, 92, word.roman, { size: 20 }));

    if (spoken) {
      const speaker = this.add
        .text(232, 0, '🔊', { fontSize: '52px' })
        .setOrigin(0.5)
        .setInteractive({ useHandCursor: true });
      speaker.on('pointerup', () => this.speak());
      layer.add(speaker);
    }
  }

  /**
   * The pictures have their backgrounds cut away, so the tile shows through.
   * They are drawn with heavy dark outlines and read well on the app's own
   * panel colour, which keeps the screen looking like the rest of the app
   * rather than like a sheet of stickers.
   */
  tileColor() {
    return COLORS.card;
  }

  decorateTile(tile, id, size) {
    const image = addWordImage(this, 0, 0, id, size - 26);
    if (image) {
      tile.add(image);
      return;
    }
    // No picture for this word yet: show the word instead of an empty card.
    const glyph = wordGlyph(id);
    if (glyph) {
      tile.add(
        addGlyph(this, 0, 0, `words:fallback:${id}:56`, glyph, {
          height: 56,
          color: COLORS.ink,
        })
      );
    }
  }

  speak() {
    sayWord(this.target);
  }
}
