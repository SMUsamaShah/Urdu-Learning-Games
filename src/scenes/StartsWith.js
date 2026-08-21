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

/**
 * Which of these starts with this letter?
 *
 * ## What it teaches that the other games do not
 *
 * FindLetter asks a child to recognise a shape. WordPictures asks them to
 * recognise a written word. This asks the question in between, and it is the
 * one that turns knowing the alphabet into beginning to read: you are shown ب,
 * and you have to reach for the *sound* it makes and find something whose name
 * begins with it — بکری, not انگور.
 *
 * That is a genuinely harder step, and it is the one the reference apps put
 * front and centre. It cannot be answered by matching shapes, because the
 * answers are pictures and there is not a letter among them.
 *
 * ## Only words that really do start with the letter
 *
 * Most of the app's words teach a letter from wherever it happens to fall —
 * ڑ, ھ and ی never begin a word, so their words teach them from the middle.
 * Those words are correct everywhere else and wrong here: a game called "which
 * one starts with this" must not have a right answer that does not. So the pool
 * is filtered to `letterIndex === 0`, and the letters left without one simply
 * do not come up.
 *
 * Distractors are any other illustrated word, chosen without regard to
 * similarity. The discrimination being practised is letter-to-sound; picking
 * words that start with confusable letters would be a different and much harder
 * game, and one a three-year-old would lose.
 */

/**
 * The prompt card. Short enough to clear the ribbon at its tallest — the ribbon
 * grows downwards to fit its instruction, and this scene's is a long one.
 */
const CARD = { width: 200, height: 176 };

export default class StartsWith extends QuizScene {
  constructor() {
    super('StartsWith');
    this.instruction = 'starts-with';
    this.instructionRoman = 'What starts with this?';
    // Cards, like WordPictures: a cut-out picture needs a plain plate behind it
    // to read against.
    this.tileSize = 200;
    this.tileGap = 30;
    this.choicesY = 505;
    /** @type {string[]} letters that have an illustrated word beginning with them */
    this.pool = [];
    /** letterId -> wordId */
    this.wordFor = new Map();
  }

  preload() {
    super.preload();
    queueWordImages(this);
  }

  onCreated() {
    const lettersInPlay = inPlay.letters();
    for (const word of activeWords()) {
      // letterIndex is where the taught letter sits inside the word. Zero is
      // the only value this game can use.
      if (word.letterIndex !== 0) continue;
      // The word being in play is not enough: these pair a *letter* with a
      // picture, so a letter switched off individually has to drop out even
      // where the word teaching it is still on.
      if (!word.letter || !letterGlyph(word.letter)) continue;
      if (!lettersInPlay.has(word.letter)) continue;
      if (!hasWordImage(word.id)) continue;
      // First word wins if a letter somehow has two; the pairing is meant to be
      // stable so a child sees the same example each time.
      if (!this.wordFor.has(word.letter)) this.wordFor.set(word.letter, word.id);
    }
    this.pool = [...this.wordFor.keys()];

    // Measured from the whole alphabet rather than from the letters this round
    // happens to use, so the prompt never changes size between rounds.
    this.promptFit = fitEmAlone(allLetterGlyphs('isolated'), CARD.width - 40, CARD.height - 40);
  }

  pickTarget(previous) {
    return pickWeighted('letter', this.pool, { avoid: [previous] });
  }

  lineUpFor(target, count) {
    const others = Phaser.Utils.Array.Shuffle(this.pool.filter((id) => id !== target));
    return Phaser.Utils.Array.Shuffle([target, ...others.slice(0, count - 1)]);
  }

  /**
   * The letter itself, large, and tappable to hear it again.
   *
   * Shown rather than only spoken. In FindLetter showing the target would be
   * giving the answer away, because the answers are letters too; here they are
   * pictures, so the letter can be on screen the whole time and the question is
   * still the question. Which matters, because a game that can only be played
   * with the sound on is no game at all until somebody has recorded 123 clips.
   */
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
    // The romanisation under the picture, for the adult reading along. A child
    // cannot read it and does not need to; a parent who does not know which
    // fruit is meant to be an angoor does.
    tile.add(label(this, 0, size / 2 - 24, word.roman, { size: 15 }));
  }

  tileColor() {
    return COLORS.panelLight;
  }

  /**
   * The letter's name, never its word.
   *
   * `sayLetter` normally follows the name with the word it teaches — "bay,
   * bakri" — which here would say the answer out loud before the child has
   * looked at the pictures.
   */
  speak() {
    sayLetter(this.target, { word: false });
  }

  /** Now the word can be said, because the picture of it has just been found. */
  onCorrect(letterId) {
    this.time.delayedCall(600, () => sayLetter(letterId));
  }
}
