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

/* Pick the letter out of a line-up. */

/* The area the letter to look for is drawn in, inside its plate. */
const PROMPT_BOX = { width: 420, height: 140 };

export default class FindLetter extends QuizScene {
  constructor() {
    super('FindLetter');
    this.instruction = 'find-letter';
    this.instructionRoman = 'Find this letter';
    // Scalloped stickers rather than squares.
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

  /* The target plus distractors, hardest first. */
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

  /* Which shape to show as the prompt when there is no recording. */
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

    // One em for every letter in every form, so the letter to look for is always drawn at the same size.
    const fit = fitEmAlone(allLetterGlyphs(), PROMPT_BOX.width, PROMPT_BOX.height);
    // The plate is still sized to the letter rather than fixed.
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
    // Every choice at one em.
    const fit = fitEmAlone(allLetterGlyphs('isolated'), size - 44, size - 56);
    tile.add(
      addGlyph(this, 0, 0, `find-choice:em${Math.round(fit.em)}:${id}`, glyph,
        chunkyGlyphEm(fit.em))
    );
  }

  /* The letter's name, then the word it teaches: "bay ... */
  speak() {
    sayLetter(this.target);
  }
}
