import Phaser from 'phaser';
import { letterGlyph, lettersById, sequenceFor } from '../lib/content.js';
import { addGlyph, fitGlyphHeight } from '../lib/glyph.js';
import { sayLetter, sayLetters } from '../lib/say.js';
import { COLORS, chunkyGlyph, familyColor, label } from '../lib/theme.js';
import QuizScene from './QuizScene.js';

/**
 * What comes next in the alphabet?
 *
 * The one thing the qaida teaches that nothing else here does. Every other game
 * is about a letter on its own — its shape, its sound, the word it starts. This
 * is about the *order*, which is what a child needs before they can be handed a
 * qaida and follow along, and it is the reason reciting the alphabet is the
 * first thing anyone is taught.
 *
 * The window is a run of consecutive letters with one missing. Early on the
 * missing one is the last, which is the question a child can actually answer:
 * "ا ب پ ت ... and then?". Once they are getting those, the gap moves into the
 * middle, which is a harder question because it cannot be answered by simply
 * carrying on — you have to know what belongs between two things.
 *
 * Distractors are the letters either side in the sequence. Off-by-one is what
 * knowing an alphabet imperfectly actually looks like, so a line-up of the real
 * neighbours is the exercise; a line-up of letters from the far end of the
 * alphabet would be a different, easier game.
 */

/** Letters shown in the caterpillar, gap included. */
const WINDOW = 5;

const SEGMENT = 104;
const SEGMENT_STEP = 96;

export default class Sequence extends QuizScene {
  constructor() {
    super('Sequence');
    this.instruction = 'whats-next';
    this.instructionRoman = 'What comes next?';
    this.tileShape = 'circle';
    this.tileSize = 158;
    this.tileGap = 26;
    this.choicesY = 542;
    this.promptY = 268;
    /** @type {string[]} */
    this.sequence = [];
    /** Index in `sequence` of the letter being asked for. */
    this.gapIndex = 0;
    /** Where the gap sits in the window: 0 is the oldest letter shown. */
    this.gapSlot = WINDOW - 1;
  }

  onCreated() {
    this.sequence = sequenceFor('alphabetical').filter((id) => letterGlyph(id));
  }

  pickTarget(previous) {
    // The gap only moves off the end once they have a few in a row. "What comes
    // next" is a question about carrying on; "what goes in the hole" is a
    // question about what belongs between two letters, and it is much harder.
    this.gapSlot = this.streak >= 4 ? Phaser.Math.Between(2, WINDOW - 1) : WINDOW - 1;

    // Enough letters before the gap to show a run, and enough after to fill the
    // window when the gap is not at the end.
    const lowest = WINDOW - 1;
    const highest = this.sequence.length - 1 - (WINDOW - 1 - this.gapSlot);
    let index = Phaser.Math.Between(lowest, highest);
    if (this.sequence[index] === previous && highest > lowest) {
      index = index === highest ? index - 1 : index + 1;
    }

    this.gapIndex = index;
    return this.sequence[index];
  }

  lineUpFor(target, count) {
    // Letters already visible in the caterpillar are never offered. Seeing ع
    // sitting in the body and also in the answers asks the child to believe two
    // contradictory things at once, and the answer stops being findable by
    // reasoning about the sequence at all.
    const shown = new Set(this.window());

    // Nearest neighbours first, so two choices is a real "is it this one or the
    // next one?" rather than an easy pair.
    const others = this.sequence
      .filter((id) => id !== target && !shown.has(id))
      .sort(
        (a, b) =>
          Math.abs(this.sequence.indexOf(a) - this.gapIndex) -
          Math.abs(this.sequence.indexOf(b) - this.gapIndex)
      )
      .slice(0, Math.max(count + 1, 3));

    return Phaser.Utils.Array.Shuffle([
      target,
      ...Phaser.Utils.Array.Shuffle(others).slice(0, count - 1),
    ]);
  }

  /** The letters visible in the caterpillar, in sequence order. */
  window() {
    const start = this.gapIndex - this.gapSlot;
    return Array.from({ length: WINDOW }, (_, i) => this.sequence[start + i]);
  }

  buildPrompt(layer) {
    const letters = this.window();

    // Right to left, matching the script: the run starts at the right, under
    // the caterpillar's head, and the gap is wherever it falls along the body.
    const xFor = (slot) => ((WINDOW - 1) / 2 - slot) * SEGMENT_STEP;

    this.drawHead(layer, xFor(-1));

    letters.forEach((id, slot) => {
      const x = xFor(slot);
      const isGap = slot === this.gapSlot;
      const body = this.add.graphics();

      if (isGap) {
        // A hole in the body rather than a blank space, so it reads as
        // something missing from this caterpillar rather than as the end of it.
        body.fillStyle(0xffffff, 0.85);
        body.fillCircle(x, 0, SEGMENT / 2);
        body.lineStyle(5, COLORS.outline, 0.35);
        body.strokeCircle(x, 0, SEGMENT / 2);
        layer.add(body);
        layer.add(
          this.add
            .text(x, 0, '?', {
              fontFamily: 'system-ui, sans-serif',
              fontSize: '54px',
              fontStyle: '700',
              color: COLORS.inkDim,
            })
            .setOrigin(0.5)
        );
        this.gapMarker = { x, y: this.promptY };
        return;
      }

      const colour = familyColor(lettersById.get(id).shapeFamily);
      body.fillStyle(COLORS.shadow, 0.2);
      body.fillCircle(x, 7, SEGMENT / 2);
      body.fillStyle(colour, 1);
      body.fillCircle(x, 0, SEGMENT / 2);
      body.lineStyle(5, 0xffffff, 0.9);
      body.strokeCircle(x, 0, SEGMENT / 2 - 5);
      body.lineStyle(3, COLORS.outline, 0.85);
      body.strokeCircle(x, 0, SEGMENT / 2);
      layer.add(body);

      const glyph = letterGlyph(id, 'isolated');
      const height = Math.round(fitGlyphHeight(glyph, SEGMENT - 34, SEGMENT - 46));
      layer.add(
        addGlyph(this, x, 0, `seq:${id}:${height}:chunky`, glyph, chunkyGlyph(height))
      );
    });

    // Under the gap, not under the middle of the caterpillar: it is pointing at
    // a place, so it has to be next to that place.
    layer.add(
      label(this, xFor(this.gapSlot), SEGMENT / 2 + 34, 'which one goes here?', {
        size: 15,
      })
    );
  }

  /** The caterpillar's face, so the row of letters is an animal. */
  drawHead(layer, x) {
    const head = this.add.graphics();
    head.fillStyle(COLORS.shadow, 0.2);
    head.fillCircle(x, 7, SEGMENT / 2 + 4);
    head.fillStyle(0x63b04b, 1);
    head.fillCircle(x, 0, SEGMENT / 2 + 4);
    head.lineStyle(3, COLORS.outline, 0.85);
    head.strokeCircle(x, 0, SEGMENT / 2 + 4);

    // Antennae, drawn before the face so they sit behind the head's edge.
    head.lineStyle(5, COLORS.outline, 0.85);
    for (const side of [-1, 1]) {
      head.beginPath();
      head.moveTo(x + side * 16, -SEGMENT / 2);
      head.lineTo(x + side * 26, -SEGMENT / 2 - 26);
      head.strokePath();
    }
    head.fillStyle(0xe4633c, 1);
    for (const side of [-1, 1]) head.fillCircle(x + side * 26, -SEGMENT / 2 - 30, 9);

    head.fillStyle(0xffffff, 1);
    head.fillCircle(x - 16, -8, 15);
    head.fillCircle(x + 16, -8, 15);
    head.fillStyle(COLORS.outline, 1);
    head.fillCircle(x - 13, -8, 7);
    head.fillCircle(x + 19, -8, 7);

    head.lineStyle(4, COLORS.outline, 1);
    head.beginPath();
    head.arc(x + 2, 14, 14, 0.15 * Math.PI, 0.85 * Math.PI);
    head.strokePath();

    layer.add(head);
  }

  tileColor(id) {
    return familyColor(lettersById.get(id).shapeFamily);
  }

  decorateTile(tile, id, size) {
    const glyph = letterGlyph(id, 'isolated');
    const height = Math.round(fitGlyphHeight(glyph, size - 48, size - 62));
    tile.add(
      addGlyph(this, 0, 0, `seq:choice:${id}:${height}:chunky`, glyph, chunkyGlyph(height))
    );
  }

  /**
   * Reads the run up to the gap, and stops there.
   *
   * Deliberately not the answer: the whole question is what comes after those,
   * and hearing the letters in order is the cue that makes it answerable rather
   * than a guess. Naming the target here would be the entire game.
   */
  speak() {
    const before = this.window().slice(0, this.gapSlot);
    sayLetters(before.slice(-3));
  }

  /** Now it can be named, because it has been found. */
  onCorrect(id) {
    this.time.delayedCall(400, () => sayLetter(id));
  }
}
