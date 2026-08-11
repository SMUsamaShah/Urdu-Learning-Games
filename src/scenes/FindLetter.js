import Phaser from 'phaser';
import {
  letterForms,
  letterGlyph,
  lettersById,
  sequenceFor,
  shapeFamilySiblings,
} from '../lib/content.js';
import { addGlyph } from '../lib/glyph.js';
import { clipKeys, hasClip, play } from '../lib/audio.js';
import { COLORS, familyColor, label } from '../lib/theme.js';
import QuizScene from './QuizScene.js';

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
export default class FindLetter extends QuizScene {
  constructor() {
    super('FindLetter');
    /** @type {string[]} */
    this.sequence = [];
  }

  onCreated() {
    this.sequence = sequenceFor('alphabetical').filter((id) => letterGlyph(id));
  }

  pickTarget(previous) {
    return Phaser.Utils.Array.GetRandom(
      this.sequence.filter((id) => id !== previous)
    );
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

    // A solid plate with the family colour as an outline. A translucent fill
    // over the background just reads as grey and says nothing.
    const plate = this.add.graphics();
    plate.fillStyle(COLORS.card, 1);
    plate.fillRoundedRect(-110, -84, 220, 168, 26);
    plate.lineStyle(4, familyColor(letter.shapeFamily), 0.9);
    plate.strokeRoundedRect(-110, -84, 220, 168, 26);
    layer.add(plate);

    layer.add(
      addGlyph(this, 0, 0, `find:prompt:${target}:${form}:112`, letterGlyph(target, form), {
        height: 112,
        color: COLORS.ink,
      })
    );
    layer.add(
      label(
        this,
        0,
        112,
        form === 'isolated' ? 'find this letter' : 'same letter, which one?',
        { size: 16 }
      )
    );
  }

  tileColor(id) {
    return familyColor(lettersById.get(id).shapeFamily);
  }

  decorateTile(tile, id) {
    tile.add(
      addGlyph(this, 0, 0, `find:choice:${id}:104`, letterGlyph(id, 'isolated'), {
        height: 104,
        color: COLORS.onColor,
      })
    );
  }

  speak() {
    if (hasClip(clipKeys.letterName(this.target))) {
      play(clipKeys.letterName(this.target));
    }
  }
}
