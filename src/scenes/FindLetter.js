import Phaser from 'phaser';
import {
  allLetterGlyphs,
  letterForms,
  letterGlyph,
  lettersById,
  sequenceFor,
  shapeFamilySiblings,
} from '../lib/content.js';
import { addGlyph, fitEmAlone, glyphMetrics } from '../lib/glyph.js';
import { clipKeys, hasClip } from '../lib/audio.js';
import { sayLetter } from '../lib/say.js';
import { COLORS, chunkyGlyphEm, familyColor, label } from '../lib/theme.js';
import QuizScene from './QuizScene.js';
import { pickWeighted } from '../lib/mastery.js';

/**
 * Pick the letter out of a line-up.
 *
 * The prompt is spoken when a recording exists and shown when it does not, and
 * the game is worth playing either way:
 *
 *   - **Heard.** The child maps a sound onto a shape, which is the thing
 *     flashcards cannot test.
 *   - **Seen.** The child matches shapes whose distractors come from the same
 *     shape family, so they differ only in their dots. ب ت ث پ ٹ are one
 *     skeleton with five different dot patterns, and telling them apart is the
 *     single most important discrimination in reading Urdu. That is not a
 *     consolation mode for a missing recording; it is a real exercise.
 *
 * So the same scene covers both, and it upgrades on its own as recordings are
 * made.
 */

/** The area the letter to look for is drawn in, inside its plate. */
const PROMPT_BOX = { width: 420, height: 140 };

export default class FindLetter extends QuizScene {
  constructor() {
    super('FindLetter');
    this.instruction = 'find-letter';
    this.instructionRoman = 'Find this letter';
    // Scalloped stickers rather than squares. Not stars: see blobPoints() in
    // theme.js for why a star is the wrong shape to put an Urdu letter in.
    this.tileShape = 'blob';
    this.tileSize = 200;
    this.tileGap = 26;
    this.choicesY = 508;
    /** @type {string[]} */
    this.sequence = [];
  }

  onCreated() {
    this.sequence = sequenceFor('alphabetical').filter((id) => letterGlyph(id));
  }

  pickTarget(previous) {
    return pickWeighted('letter', this.sequence, { avoid: [previous] });
  }

  /**
   * The target plus distractors, hardest first.
   *
   * Same-family letters share a skeleton and differ only in dots, so they are
   * the distractors worth using. Families are small, so the rest is topped up
   * from anywhere.
   */
  lineUpFor(target, count) {
    const siblings = Phaser.Utils.Array.Shuffle(
      shapeFamilySiblings(target).filter((id) => letterGlyph(id))
    );
    const chosen = siblings.slice(0, count - 1);

    if (chosen.length < count - 1) {
      const rest = Phaser.Utils.Array.Shuffle(
        this.sequence.filter((id) => id !== target && !chosen.includes(id))
      );
      chosen.push(...rest.slice(0, count - 1 - chosen.length));
    }

    return Phaser.Utils.Array.Shuffle([target, ...chosen]);
  }

  /**
   * Which shape to show as the prompt when there is no recording.
   *
   * Showing the isolated form means the prompt is pixel-identical to the right
   * answer, and a child can win by comparing silhouettes without knowing they
   * are looking at a letter. So once they are a few in a row, the prompt
   * switches to another positional form: same letter, different shape. That is
   * the thing about Urdu a Latin-alphabet app never has to teach, and it turns
   * matching into recognition.
   *
   * Non-joiners only have an isolated form, so they stay a plain match.
   */
  promptForm() {
    if (this.streak < 3) return 'isolated';
    const others = letterForms(this.target).filter((f) => f !== 'isolated');
    return others.length ? Phaser.Utils.Array.GetRandom(others) : 'isolated';
  }

  buildPrompt(layer, target) {
    if (hasClip(clipKeys.letterName(target))) {
      layer.add(this.speakerButton());
      return;
    }

    const form = this.promptForm();
    const letter = lettersById.get(target);
    const glyph = letterGlyph(target, form);

    // One em for every letter in every form, so the letter to look for is
    // always drawn at the same size. Fitted to a height it was not: the shown
    // form varies round to round, and a medial ـبـ scaled to fill the plate came
    // out several times the size of the isolated ب the child had just been
    // shown, which is the opposite of the lesson.
    const fit = fitEmAlone(allLetterGlyphs(), PROMPT_BOX.width, PROMPT_BOX.height);
    // The plate is still sized to the letter rather than fixed. Urdu has letters
    // several times wider than they are tall, and a fixed card leaves those
    // hanging out over the edge of it.
    const plateW = Math.max(220, glyphMetrics(glyph, fit.em).width + 60);
    const plateH = 168;

    const plate = this.add.graphics();
    plate.fillStyle(COLORS.card, 1);
    plate.fillRoundedRect(-plateW / 2, -plateH / 2, plateW, plateH, 26);
    plate.lineStyle(5, familyColor(letter.shapeFamily), 1);
    plate.strokeRoundedRect(-plateW / 2, -plateH / 2, plateW, plateH, 26);
    layer.add(plate);

    layer.add(
      addGlyph(this, 0, 0, `find-prompt:em${Math.round(fit.em)}:${target}:${form}`, glyph, {
        em: fit.em,
        color: COLORS.ink,
      })
    );
    layer.add(
      label(
        this,
        0,
        plateH / 2 + 28,
        form === 'isolated' ? 'find this letter' : 'same letter, which one?',
        { size: 16 }
      )
    );
  }

  tileColor(id) {
    return familyColor(lettersById.get(id).shapeFamily);
  }

  decorateTile(tile, id, size) {
    const glyph = letterGlyph(id, 'isolated');
    // Every choice at one em. Fitting each to its own tile made size a tell —
    // the child could learn that the odd-looking big one is never the answer —
    // as well as making a row of four look haphazard.
    const fit = fitEmAlone(allLetterGlyphs('isolated'), size - 44, size - 56);
    tile.add(
      addGlyph(this, 0, 0, `find-choice:em${Math.round(fit.em)}:${id}`, glyph,
        chunkyGlyphEm(fit.em))
    );
  }

  /**
   * The letter's name, then the word it teaches: "bay ... bakri".
   *
   * Naming the word does not give the answer away — the answer is a shape, and
   * the word is not written anywhere on screen — and it is most of what makes
   * the letter mean something rather than being a noise attached to a squiggle.
   */
  speak() {
    sayLetter(this.target);
  }
}
