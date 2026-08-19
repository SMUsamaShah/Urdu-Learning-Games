import Caterpillar from './Caterpillar.js';
import { activeNumbers, allNumberGlyphs, numberGlyph } from '../lib/content.js';
import { sayNumber } from '../lib/say.js';

/**
 * The Caterpillar, counting.
 *
 * ## Why the same game twice
 *
 * The mechanic is identical to the letter version — a run with holes and a tray
 * to fill them from — and that is on purpose rather than for want of an idea.
 * A three-year-old who has worked out how the letter caterpillar works should
 * not have to work anything out again to count; the whole value here is that
 * the *only* thing that changed is what is in it. Learning ۰ ۱ ۲ ۳ is a
 * separate job from learning ا ب پ ت, and the reference apps keep their number
 * activities separate from their letter ones for the same reason.
 *
 * It is a subclass rather than a copy: `items`, `glyphFor`, `allGlyphs`, `say`
 * and `sayRun` are the whole of what differs, and Caterpillar is written
 * against those hooks and never against the alphabet directly. Anything fixed
 * in one is fixed in both.
 *
 * ## Shorter runs
 *
 * There are ten numerals against thirty-eight letters, so a run of twelve is
 * not available and a run of eight would be most of the set every time. Four to
 * six keeps a round from being the same round.
 */
export default class NumberLine extends Caterpillar {
  constructor() {
    super('NumberLine');
    this.instruction = 'count-gaps';
    this.instructionRoman = 'Fill in the counting';
  }

  /** Shorter runs: there are ten numerals against thirty-eight letters. */
  get rounds() {
    return [
      { run: 5, holes: 1, tray: 3 },
      { run: 6, holes: 2, tray: 4 },
      { run: 7, holes: 2, tray: 4 },
      { run: 8, holes: 3, tray: 5 },
    ];
  }

  items() {
    return activeNumbers()
      .map((n) => n.id)
      .filter((id) => numberGlyph(id));
  }

  glyphFor(id) {
    return numberGlyph(id);
  }

  allGlyphs() {
    return allNumberGlyphs();
  }

  get keyPrefix() {
    return 'number-line';
  }

  say(id) {
    sayNumber(id);
  }

  sayRun(ids) {
    // Counted one after another, which is what makes it counting rather than a
    // row of shapes — the same reason the letter version reads its run back.
    ids.forEach((id, i) => this.time.delayedCall(i * 620, () => sayNumber(id)));
  }
}
