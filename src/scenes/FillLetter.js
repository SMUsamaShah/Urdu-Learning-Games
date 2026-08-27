import QuizScene from './QuizScene.js';
import { allLetterGlyphs, brokenWord, letterGlyph } from '../lib/content.js';
import { addGlyph, fitEmAlone } from '../lib/glyph.js';
import { addWordImage, queueWordImages } from '../lib/images.js';
import { pickWord, shuffle, spellableWords } from '../lib/spelling.js';
import { sayWord } from '../lib/say.js';
import { COLORS, familyColor } from '../lib/theme.js';
import { lettersById } from '../lib/content.js';
import { chooseWeighted, weightOf } from '../lib/mastery.js';

/* One letter is missing. */

/* The row of letters being read, and the empty socket in it. */
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
    /* Which letter of the word has been taken out. */
    this.gap = 0;
    // The empty socket in the row.
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

  /* A letter of a word, as `wordId:index`. */
  pickTarget(previous) {
    // Words weighed by the letters inside them.
    const word = pickWord(this.wordId, undefined, (candidate) => {
      const inside = (brokenWord(candidate.id) ?? []).slice(1);
      return inside.length ? Math.max(...inside.map((id) => weightOf('letter', id))) : 1;
    });
    this.wordId = word.id;
    const letters = brokenWord(word.id);
    // Never the first letter.
    const choices = letters.map((id, index) => index).filter((index) => index > 0);
    const from = choices.filter((index) => letters[index] !== previous);
    const pool = from.length ? from : choices;
    this.gap = chooseWeighted(pool, (index) => weightOf('letter', letters[index]));
    return letters[this.gap];
  }

  /* The answer plus letters that really do turn up in words. */
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
