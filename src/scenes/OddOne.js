import Phaser from 'phaser';
import {
  activeLetters,
  allLetterGlyphs,
  letterGlyph,
  lettersById,
  shapeFamilySiblings,
} from '../lib/content.js';
import { addGlyph, fitEmAlone } from '../lib/glyph.js';
import { sayLetter } from '../lib/say.js';
import { COLORS, familyColor, label } from '../lib/theme.js';
import QuizScene from './QuizScene.js';
import { pickWeighted } from '../lib/mastery.js';

/* Which one does not belong? */

export default class OddOne extends QuizScene {
  constructor() {
    super('OddOne');
    this.instruction = 'odd-one';
    this.instructionRoman = 'Which is different?';
    this.tileSize = 190;
    this.tileGap = 34;
    this.choicesY = 470;
    // Always four: three of a kind and one that is not.
    this.choicesByStreak = [4];
    /* Families with enough letters to make a group of three. */
    this.families = [];
    /* The line-up for this round, decided in pickTarget. */
    this.lineUp = [];
  }

  onCreated() {
    const byFamily = new Map();
    for (const letter of activeLetters()) {
      if (!letterGlyph(letter.id)) continue;
      const family = letter.shapeFamily;
      byFamily.set(family, [...(byFamily.get(family) ?? []), letter.id]);
    }
    this.byFamily = byFamily;
    this.families = [...byFamily.entries()]
      .filter(([, ids]) => ids.length >= 3)
      .map(([family]) => family);
    this.fit = fitEmAlone(allLetterGlyphs('isolated'), this.tileSize - 60, this.tileSize - 76);
  }

  /* Builds the whole line-up here, and returns the odd one as the target. */
  pickTarget(previous) {
    const family = Phaser.Utils.Array.GetRandom(this.families);
    const three = Phaser.Utils.Array.Shuffle([...this.byFamily.get(family)]).slice(0, 3);

    // From a different family, and not one that merely differs by dots.
    const strangers = activeLetters()
      .map((letter) => letter.id)
      .filter(
        (id) =>
          id !== previous &&
          letterGlyph(id) &&
          lettersById.get(id).shapeFamily !== family &&
          !shapeFamilySiblings(three[0]).includes(id)
      );
    // The odd one is the answer, so it is the one worth weighting.
    const odd = pickWeighted('letter', strangers);

    this.lineUp = Phaser.Utils.Array.Shuffle([...three, odd]);
    return odd;
  }

  lineUpFor() {
    return this.lineUp;
  }

  /* No prompt: the question is the line-up itself. */
  buildPrompt(layer) {
    layer.add(
      label(this, 0, 0, 'three are the same, one is not', { size: 18, color: COLORS.inkDim })
    );
  }

  decorateTile(tile, letterId, size) {
    tile.add(
      addGlyph(
        this,
        0,
        0,
        `odd-one:em${Math.round(this.fit.em)}:${letterId}`,
        letterGlyph(letterId, 'isolated'),
        { em: this.fit.em, color: COLORS.ink }
      )
    );
  }

  /* Every tile the same colour. */
  tileColor() {
    return COLORS.panelLight;
  }

  /* Nothing to say up front: naming a letter would point at a group. */
  speak() {}

  /* Once found, it is worth hearing what the odd one actually was. */
  onCorrect(letterId) {
    this.time.delayedCall(400, () => sayLetter(letterId));
    // And the three that matched light up in their family's colour, which is the lesson: those three were one shape all along.
    const family = familyColor(
      lettersById.get(this.lineUp.find((id) => id !== letterId)).shapeFamily
    );
    for (const tile of this.choicesLayer.list) {
      if (tile.choiceId === letterId) continue;
      const ring = this.add.graphics();
      ring.lineStyle(6, family, 1);
      ring.strokeRoundedRect(-this.tileSize / 2, -this.tileSize / 2, this.tileSize, this.tileSize, 22);
      tile.add(ring);
    }
  }
}
