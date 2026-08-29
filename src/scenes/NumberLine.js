import Caterpillar from './Caterpillar.js';
import { activeNumbers, allNumberGlyphs, numberGlyph } from '../lib/content.js';
import { sayNumber } from '../lib/say.js';

/* The Caterpillar, counting. */
export default class NumberLine extends Caterpillar {
  constructor() {
    super('NumberLine');
    this.instruction = 'count-gaps';
    this.instructionRoman = 'Fill in the counting';
  }

  /* Shorter runs: there are ten numerals against thirty-eight letters. */
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
    // Counted one after another.
    ids.forEach((id, i) => this.time.delayedCall(i * 620, () => sayNumber(id)));
  }
}
