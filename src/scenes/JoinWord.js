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
import { sayWord } from '../lib/say.js';
import { COLORS } from '../lib/theme.js';

/**
 * These letters — which word do they make?
 *
 * ## The one game here that only makes sense in Urdu
 *
 * Every other spelling screen in this app has an English equivalent somewhere.
 * This one does not, because English letters do not change shape when you write
 * them next to each other and Urdu letters do. ب ک ر ی and بکری are the same
 * four letters, and there is nothing in the second that visibly contains the
 * first: the ب has lost its bowl, the ک has grown a long rising stroke, and all
 * four have been fused into one run of ink by the typeface.
 *
 * A child who has learned the alphabet and then opens a book meets this wall,
 * and no amount of more letter practice gets them over it. So: the letters at
 * the top in the shapes they know, three written words underneath, and the
 * question is which one these letters become.
 *
 * ## The distractors have to be the same length
 *
 * Otherwise the answer is the one with four blobs in it and the game is about
 * counting. `wordDistractors()` prefers words of the same letter count for
 * exactly this reason, and falls back to any word only when there are not
 * enough — six of the app's words are three letters long, so the shortest
 * rounds can run out.
 *
 * ## No picture
 *
 * Deliberately. The picture would answer the question without any reading at
 * all, and reading is the whole exercise. The word is not spoken until it has
 * been found, either — for the same reason.
 */

/** The row of isolated letters at the top. */
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

  /**
   * One choice: the word as it is actually written.
   *
   * Fitted across every word in the app rather than to this tile, so a two
   * letter word and a five letter one come out at the same size — otherwise the
   * shortest word on screen is the biggest and the line-up can be read by
   * looking at nothing.
   */
  decorateTile(tile, id, size, height) {
    const em = fitEmAlone(allWordGlyphs(), size - 44, height - 44).em;
    const glyph = wordGlyph(id);
    if (!glyph) return;
    tile.add(
      addGlyph(this, 0, 0, `join-word:em${Math.round(em)}:${id}`, glyph, {
        em,
        color: COLORS.ink,
      })
    );
  }

  /** The letters, in the shapes a flashcard taught them, right to left. */
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
    });
  }

  /** Said once it has been found, never before — see the note at the top. */
  onCorrect(id) {
    sayWord(id);
  }
}
