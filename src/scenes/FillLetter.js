import QuizScene from './QuizScene.js';
import { allLetterGlyphs, brokenWord, letterGlyph } from '../lib/content.js';
import { addGlyph, fitEmAlone } from '../lib/glyph.js';
import { addWordImage, queueWordImages } from '../lib/images.js';
import { pickWord, shuffle, spellableWords } from '../lib/spelling.js';
import { sayWord } from '../lib/say.js';
import { COLORS, familyColor } from '../lib/theme.js';
import { lettersById } from '../lib/content.js';
import { chooseWeighted, weightOf } from '../lib/mastery.js';

/**
 * One letter is missing. Which one?
 *
 * The gentlest of the three spelling screens and the one to meet first. The
 * word is already spelled out — its letters in their isolated shapes, right to
 * left, the way the Letters screen shows them — with exactly one of them
 * replaced by an empty socket. Three letters underneath; one of them fits.
 *
 * ## Why the broken form rather than the written word
 *
 * Cutting a hole in بکری is the more elegant question and mostly impossible:
 * AlQalam Taj fuses joined letters into single outlines, so in twenty-eight of
 * the thirty-seven words there is no ب-shaped piece to remove. `taughtCluster()`
 * exists precisely to say when there is, and it says no far more often than
 * yes.
 *
 * Taking the word apart first sidesteps that completely, and it asks the same
 * thing: which letter belongs here. It also builds directly on the row the
 * Letters screen already shows under every word, so a child arrives here having
 * seen this exact layout before.
 *
 * ## Carried into the hole
 *
 * The socket in the row is a real place, so the letter is dragged into it
 * rather than tapped. That is the one thing this screen has that the other
 * pick-one games do not, and it is why this one drags and they do not.
 *
 * ## The picture is the clue
 *
 * Without it this would be a memory test — nothing on screen says which word
 * is meant. With it, and with the word spoken, a child who knows the letters'
 * sounds can work it out, which is the skill.
 */

/**
 * The row of letters being read, and the empty socket in it.
 *
 * `y` is measured from the prompt layer's own origin, which QuizScene puts at
 * `promptY` — everything a subclass draws in `buildPrompt` is in that layer's
 * coordinates, so this is 120px below the picture rather than 356 down the
 * screen.
 */
const ROW = { size: 108, gap: 12, y: 126 };

export default class FillLetter extends QuizScene {
  constructor() {
    super('FillLetter');
    this.instruction = 'fill-letter-word';
    this.instructionRoman = 'Which letter is missing?';
    this.choicesY = 556;
    this.promptY = 300;
    this.tileSize = 150;
    this.choicesByStreak = [2, 2, 3, 3, 3, 4];
    /** @type {string|null} */
    this.wordId = null;
    /** Which letter of the word has been taken out. */
    this.gap = 0;
    // The empty socket in the row. Worked out from the same numbers that draw
    // it, rather than remembered when it is drawn, so the two cannot disagree.
    this.dragTarget = () => {
      const letters = brokenWord(this.wordId) ?? [];
      const step = ROW.size + ROW.gap;
      const right = (letters.length * step - ROW.gap) / 2 - ROW.size / 2;
      return { x: this.stageX + right - this.gap * step, y: this.promptY + ROW.y };
    };
  }

  preload() {
    super.preload();
    queueWordImages(this);
  }

  /**
   * A letter of a word, as `wordId:index`.
   *
   * The target is the missing letter's *id*, so two words that both want a ب
   * are the same answer; what changes round to round is which word and which
   * position, which is carried here rather than in a field so QuizScene's
   * "never the same target twice running" applies to the letter.
   */
  pickTarget(previous) {
    // Words weighed by the letters inside them, because the question this
    // screen asks is about a letter and the word is only where it lives. A word
    // is worth dealing to the extent that it contains a letter he is missing,
    // so the pull is the best letter in it rather than the average — one hard
    // letter is a reason to show a word, three easy ones are not a reason not
    // to.
    const word = pickWord(this.wordId, undefined, (candidate) => {
      const inside = (brokenWord(candidate.id) ?? []).slice(1);
      return inside.length ? Math.max(...inside.map((id) => weightOf('letter', id))) : 1;
    });
    this.wordId = word.id;
    const letters = brokenWord(word.id);
    // Never the first letter. That one is what StartsWith already asks about,
    // and it is guessable from the picture alone by a child who cannot yet read
    // a single other letter of the word.
    const choices = letters.map((id, index) => index).filter((index) => index > 0);
    const from = choices.filter((index) => letters[index] !== previous);
    const pool = from.length ? from : choices;
    this.gap = chooseWeighted(pool, (index) => weightOf('letter', letters[index]));
    return letters[this.gap];
  }

  /**
   * The answer plus letters that really do turn up in words.
   *
   * Its own shape family first where there is one — telling ب from ت is a
   * question about dots, which is the question this game is best at asking.
   */
  lineUpFor(target, count) {
    const family = lettersById.get(target)?.shapeFamily;
    const others = new Set();
    for (const word of spellableWords()) {
      for (const id of brokenWord(word.id)) if (id !== target) others.add(id);
    }
    const siblings = shuffle(
      [...others].filter((id) => lettersById.get(id)?.shapeFamily === family)
    );
    const rest = shuffle([...others].filter((id) => lettersById.get(id)?.shapeFamily !== family));
    return shuffle([target, ...siblings, ...rest].slice(0, count));
  }

  tileColor(id) {
    return familyColor(lettersById.get(id)?.shapeFamily);
  }

  decorateTile(tile, id, size) {
    const em = fitEmAlone(allLetterGlyphs('isolated'), size - 52, size - 52).em;
    tile.add(
      addGlyph(this, 0, 0, `fill-letter:em${Math.round(em)}:${id}`, letterGlyph(id, 'isolated'), {
        em,
        color: COLORS.onColor,
      })
    );
  }

  buildPrompt(layer, target) {
    const word = this.wordId;
    const letters = brokenWord(word);
    const em = fitEmAlone(allLetterGlyphs('isolated'), ROW.size - 34, ROW.size - 34).em;

    const picture = addWordImage(this, 0, -62, word, 168);
    if (picture) layer.add(picture);
    else {
      const emoji = spellableWords().find((w) => w.id === word)?.emoji;
      if (emoji) layer.add(this.add.text(0, -62, emoji, { fontSize: '112px' }).setOrigin(0.5));
    }

    const step = ROW.size + ROW.gap;
    const width = letters.length * step - ROW.gap;
    // Right to left, so the first letter of the word is the rightmost cell.
    const right = width / 2 - ROW.size / 2;

    letters.forEach((id, index) => {
      const x = right - index * step;
      const missing = index === this.gap;
      const plate = this.add.graphics();
      const half = ROW.size / 2;
      plate.fillStyle(COLORS.shadow, 0.14);
      plate.fillRoundedRect(x - half, ROW.y - half + 5, ROW.size, ROW.size, 18);
      plate.fillStyle(missing ? 0xffffff : COLORS.card, missing ? 0.7 : 1);
      plate.fillRoundedRect(x - half, ROW.y - half, ROW.size, ROW.size, 18);
      plate.lineStyle(missing ? 6 : 3, missing ? COLORS.accent : COLORS.outline, missing ? 1 : 0.4);
      plate.strokeRoundedRect(x - half + 2, ROW.y - half + 2, ROW.size - 4, ROW.size - 4, 16);
      layer.add(plate);

      if (missing) return;
      layer.add(
        addGlyph(this, x, ROW.y, `fill-row:em${Math.round(em)}:${id}`, letterGlyph(id, 'isolated'), {
          em,
          color: COLORS.ink,
        })
      );
    });
  }

  speak() {
    sayWord(this.wordId);
  }

  onCorrect() {
    sayWord(this.wordId);
  }
}
