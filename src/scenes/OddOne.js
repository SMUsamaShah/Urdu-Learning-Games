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

/**
 * Which one does not belong?
 *
 * ## The only screen that asks about a group rather than about a letter
 *
 * Everywhere else the question is "which of these is X", and the answer can be
 * found by comparing each choice against a prompt. Here there is no prompt.
 * The choices have to be compared against *each other*, and the answer is
 * whichever one breaks the pattern. That is a categorising question rather than
 * a matching one, and it is the first time this app asks for one.
 *
 * ## What the pattern is
 *
 * The shape family. Urdu's alphabet is a small number of skeletons wearing
 * different numbers of dots: ب ت ث پ are one shape, ج چ ح خ another, ر ز ڑ ژ a
 * third. Three from one family and one from another is a question a child can
 * answer by looking at the shapes alone, before they can name any of them —
 * and noticing that those four are the same shape underneath is most of what
 * makes the alphabet learnable rather than thirty-eight unrelated pictures.
 *
 * The odd one is deliberately from a *visually distant* family. Making the
 * odd one out another near-identical skeleton would be a spot-the-dot puzzle,
 * which TapAll and Baskets already are, and would have no single defensible
 * answer.
 */

export default class OddOne extends QuizScene {
  constructor() {
    super('OddOne');
    this.instruction = 'odd-one';
    this.instructionRoman = 'Which is different?';
    this.tileSize = 190;
    this.tileGap = 34;
    this.choicesY = 470;
    // Always four: three of a kind and one that is not. The usual
    // two-then-three-then-four ramp makes no sense for this question — with
    // two choices there is no pattern to break.
    this.choicesByStreak = [4];
    /** Families with enough letters to make a group of three. */
    this.families = [];
    /** The line-up for this round, decided in pickTarget. */
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

  /**
   * Builds the whole line-up here, and returns the odd one as the target.
   *
   * pickTarget runs before lineUpFor, so this is where the round is actually
   * decided; lineUpFor just hands back what was chosen. The alternative — pick
   * an odd letter first, then find three that share a family it is not in —
   * is the same work in a more awkward order.
   */
  pickTarget(previous) {
    const family = Phaser.Utils.Array.GetRandom(this.families);
    const three = Phaser.Utils.Array.Shuffle([...this.byFamily.get(family)]).slice(0, 3);

    // From a different family, and not one that merely differs by dots.
    // `previous` is excluded like every other screen here does it: the same odd
    // letter twice running is a duller round, and it also looks to anything
    // watching from outside like the round never advanced.
    const strangers = activeLetters()
      .map((letter) => letter.id)
      .filter(
        (id) =>
          id !== previous &&
          letterGlyph(id) &&
          lettersById.get(id).shapeFamily !== family &&
          !shapeFamilySiblings(three[0]).includes(id)
      );
    const odd = Phaser.Utils.Array.GetRandom(strangers);

    this.lineUp = Phaser.Utils.Array.Shuffle([...three, odd]);
    return odd;
  }

  lineUpFor() {
    return this.lineUp;
  }

  /** No prompt: the question is the line-up itself. */
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

  /**
   * Every tile the same colour.
   *
   * The families have colours elsewhere in the app — see familyColor — and
   * using them here would paint the answer on the tile. This is the one screen
   * where the shape has to carry it alone.
   */
  tileColor() {
    return COLORS.panelLight;
  }

  /** Nothing to say up front: naming a letter would point at a group. */
  speak() {}

  /** Once found, it is worth hearing what the odd one actually was. */
  onCorrect(letterId) {
    this.time.delayedCall(400, () => sayLetter(letterId));
    // And the three that matched light up in their family's colour, which is
    // the lesson: those three were one shape all along.
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
