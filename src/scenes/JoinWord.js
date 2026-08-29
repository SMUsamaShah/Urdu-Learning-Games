import QuizScene from './QuizScene.js';
import {
  allLetterGlyphs,
  allWordGlyphs,
  brokenWord,
  letterGlyph,
  wordGlyph,
} from '../lib/content.js';
import { addGlyph, fitEmAlone } from '../lib/glyph.js';
import { pickWord, shuffle, wordDistractors } from '../lib/spelling.js';
import { sayLetter, sayWord } from '../lib/say.js';
import { COLORS } from '../lib/theme.js';
import { coloredWordParts, WORD_OUTLINE } from '../lib/word-colors.js';

/* These letters — which word do they make? */

/* The row of isolated letters at the top. */
const ROW = { size: 100, gap: 12, y: -6 };

export default class JoinWord extends QuizScene {
  constructor() {
    super('JoinWord');
    this.instruction = 'join-word';
    this.instructionRoman = 'Which word do these make?';
    this.subjectKind = 'word';
    this.choicesY = 522;
    this.tileSize = 236;
    this.tileHeight = 156;
    this.tileTilt = 1.5;
    this.choicesByStreak = [2, 2, 3, 3, 3];
    this.promptY = 300;
  }

  pickTarget(previous) {
    return pickWord(previous).id;
  }

  lineUpFor(target, count) {
    return shuffle([target, ...wordDistractors(target, count - 1)]);
  }

  tileColor() {
    return COLORS.panelLight;
  }

  /* One choice: the word as it is actually written. */
  decorateTile(tile, id, size, height) {
    const em = fitEmAlone(allWordGlyphs(), size - 44, height - 44).em;
    const glyph = wordGlyph(id);
    if (!glyph) return;
    const parts = coloredWordParts(glyph);
    tile.add(
      addGlyph(this, 0, 0, `join-word:em${Math.round(em)}:${id}:coloured`, glyph, {
        em,
        color: COLORS.ink,
        parts,
        ...WORD_OUTLINE,
      })
    );
  }

  /* The letters, in the shapes a flashcard taught them, right to left. */
  buildPrompt(layer, target) {
    const letters = brokenWord(target) ?? [];
    const em = fitEmAlone(allLetterGlyphs('isolated'), ROW.size - 30, ROW.size - 30).em;
    const step = ROW.size + ROW.gap;
    const right = (letters.length * step - ROW.gap) / 2 - ROW.size / 2;

    letters.forEach((id, index) => {
      const x = right - index * step;
      const half = ROW.size / 2;
      const plate = this.add.graphics();
      plate.fillStyle(COLORS.shadow, 0.14);
      plate.fillRoundedRect(x - half, ROW.y - half + 5, ROW.size, ROW.size, 18);
      plate.fillStyle(COLORS.card, 1);
      plate.fillRoundedRect(x - half, ROW.y - half, ROW.size, ROW.size, 18);
      plate.lineStyle(3, COLORS.outline, 0.4);
      plate.strokeRoundedRect(x - half + 2, ROW.y - half + 2, ROW.size - 4, ROW.size - 4, 16);
      layer.add(plate);
      layer.add(
        addGlyph(this, x, ROW.y, `join-row:em${Math.round(em)}:${id}`, letterGlyph(id, 'isolated'), {
          em,
          color: COLORS.ink,
        })
      );
      const letterZone = this.add.zone(x, ROW.y, ROW.size, ROW.size);
      letterZone.setInteractive({ useHandCursor: true });
      letterZone.on('pointerup', () => sayLetter(id, { word: false, sound: true }));
      layer.add(letterZone);
    });
  }

  /* Speak the word after it has been found. */
  onCorrect(id) {
    this.showCompletedWord(id, { y: 94, width: 540, height: 74 });
    sayWord(id);
  }
}
