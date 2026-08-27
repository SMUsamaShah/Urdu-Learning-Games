import Phaser from 'phaser';
import {
  activeWords,
  allLetterGlyphs,
  inPlay,
  letterGlyph,
  wordsById,
} from '../lib/content.js';
import { addGlyph, fitEmAlone } from '../lib/glyph.js';
import { clipKeys, hasClip } from '../lib/audio.js';
import { addWordImage, hasWordImage, queueWordImages } from '../lib/images.js';
import { sayLetter } from '../lib/say.js';
import { COLORS, label } from '../lib/theme.js';
import QuizScene from './QuizScene.js';
import { pickWeighted } from '../lib/mastery.js';

/* Which of these starts with this letter? */

/* The prompt card. */
const CARD = { width: 200, height: 176 };

export default class StartsWith extends QuizScene {
  constructor() {
    super('StartsWith');
    this.instruction = 'starts-with';
    this.instructionRoman = 'What starts with this?';
    // Cards, like WordPictures: a cut-out picture needs a plain plate behind it to read against.
    this.tileSize = 200;
    this.tileGap = 30;
    this.choicesY = 505;
    /** @type {string[]} */
    this.pool = [];
    /* letterId -> wordId */
    this.wordFor = new Map();
  }

  preload() {
    super.preload();
    queueWordImages(this);
  }

  onCreated() {
    const lettersInPlay = inPlay.letters();
    for (const word of activeWords()) {
      // letterIndex is where the taught letter sits inside the word.
      if (word.letterIndex !== 0) continue;
      // The word being in play is not enough.
      if (!word.letter || !letterGlyph(word.letter)) continue;
      if (!lettersInPlay.has(word.letter)) continue;
      if (!hasWordImage(word.id)) continue;
      // First word wins if a letter somehow has two.
      if (!this.wordFor.has(word.letter)) this.wordFor.set(word.letter, word.id);
    }
    this.pool = [...this.wordFor.keys()];

    // Measured from the whole alphabet rather than from the letters this round happens to use.
    this.promptFit = fitEmAlone(allLetterGlyphs('isolated'), CARD.width - 40, CARD.height - 40);
  }

  pickTarget(previous) {
    return pickWeighted('letter', this.pool, { avoid: [previous] });
  }

  lineUpFor(target, count) {
    const others = Phaser.Utils.Array.Shuffle(this.pool.filter((id) => id !== target));
    return Phaser.Utils.Array.Shuffle([target, ...others.slice(0, count - 1)]);
  }

  /* The letter itself, large, and tappable to hear it again. */
  buildPrompt(layer, target) {
    const card = this.add.container(0, 0);
    const { width: w, height: h } = CARD;
    const plate = this.add.graphics();
    plate.fillStyle(COLORS.shadow, 0.18);
    plate.fillRoundedRect(-w / 2, -h / 2 + 6, w, h, 24);
    plate.fillStyle(COLORS.card, 1);
    plate.fillRoundedRect(-w / 2, -h / 2, w, h, 24);
    plate.lineStyle(5, COLORS.accent, 1);
    plate.strokeRoundedRect(-w / 2, -h / 2, w, h, 24);
    card.add(plate);
    card.add(
      addGlyph(
        this,
        0,
        0,
        `starts-with-prompt:em${Math.round(this.promptFit.em)}:${target}`,
        letterGlyph(target, 'isolated'),
        { em: this.promptFit.em, color: COLORS.ink }
      )
    );
    layer.add(card);
    if (hasClip(clipKeys.letterName(target))) layer.add(this.speakerIcon(w / 2 + 60));
  }

  decorateTile(tile, letterId, size) {
    const wordId = this.wordFor.get(letterId);
    const word = wordsById.get(wordId);
    const image = addWordImage(this, 0, -12, wordId, size - 40);
    if (image) tile.add(image);
    // The romanisation under the picture, for the adult reading along.
    tile.add(label(this, 0, size / 2 - 24, word.roman, { size: 15 }));
  }

  tileColor() {
    return COLORS.panelLight;
  }

  /* The letter's name, never its word. */
  speak() {
    sayLetter(this.target, { word: false });
  }

  /* Now the word can be said, because the picture of it has just been found. */
  onCorrect(letterId) {
    this.time.delayedCall(600, () => sayLetter(letterId));
  }
}
