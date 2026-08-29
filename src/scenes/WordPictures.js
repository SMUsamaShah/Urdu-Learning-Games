import Phaser from 'phaser';
import { allWordGlyphs, inPlay, wordGlyph, wordsById } from '../lib/content.js';
import { addGlyph, fitEmAlone } from '../lib/glyph.js';
import { clipKeys, hasClip } from '../lib/audio.js';
import { addWordImage, illustratedWords, queueWordImages } from '../lib/images.js';
import { sayWord } from '../lib/say.js';
import { COLORS, label } from '../lib/theme.js';
import { coloredWordParts, WORD_OUTLINE } from '../lib/word-colors.js';
import QuizScene from './QuizScene.js';
import { pickWeighted } from '../lib/mastery.js';

/* Which picture is this word? */

/* The plate the word is written on. */
const PLATE = { width: 380, height: 132 };

export default class WordPictures extends QuizScene {
  constructor() {
    super('WordPictures');
    this.instruction = 'find-picture';
    this.instructionRoman = 'Find the picture';
    this.subjectKind = 'word';
    // Cards here rather than a shape.
    this.tileSize = 200;
    this.tileGap = 30;
    this.choicesY = 505;
    /** @type {string[]} */
    this.pool = [];
  }

  preload() {
    super.preload();
    // Phaser reuses WebP textures that are already loaded.
    queueWordImages(this);
  }

  onCreated() {
    const shown = inPlay.words();
    this.pool = illustratedWords().filter((id) => wordsById.has(id) && shown.has(id));
    // Fit against every word so the prompt size stays stable between rounds.
    this.promptFit = fitEmAlone(allWordGlyphs(), PLATE.width - 40, PLATE.height - 16);
    this.fallbackFit = fitEmAlone(allWordGlyphs(), this.tileSize - 40, this.tileSize - 64);
  }

  pickTarget(previous) {
    return pickWeighted('word', this.pool, { avoid: [previous] });
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

    // The word itself is always shown, even when it is also spoken.
    const plate = this.add.graphics();
    plate.fillStyle(COLORS.card, 1);
    plate.fillRoundedRect(-PLATE.width / 2, -PLATE.height / 2, PLATE.width, PLATE.height, 26);
    layer.add(plate);

    // Every word at one em, so the writing stays the same size round to round.
    const glyph = wordGlyph(target);
    if (glyph) {
      const parts = coloredWordParts(glyph);
      layer.add(
        addGlyph(this, 0, 0, `word-prompt:em${Math.round(this.promptFit.em)}:${target}:coloured`, glyph, {
          em: this.promptFit.em,
          color: COLORS.ink,
          parts,
          ...WORD_OUTLINE,
        })
      );
    }
    layer.add(label(this, 0, 92, word.roman, { size: 20 }));

    if (spoken) layer.add(this.speakerIcon(232, 52));
  }

  /* The pictures have their backgrounds cut away, so the tile shows through. */
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
      const parts = coloredWordParts(glyph);
      tile.add(
        addGlyph(this, 0, -8, `word-tile:em${Math.round(this.fallbackFit.em)}:${id}:coloured`, glyph, {
          em: this.fallbackFit.em,
          color: COLORS.ink,
          parts,
          ...WORD_OUTLINE,
        })
      );
    }
  }

  speak() {
    sayWord(this.target);
  }
}
