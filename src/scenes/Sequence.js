import Phaser from 'phaser';
import { allLetterGlyphs, letterGlyph, lettersById, sequenceFor } from '../lib/content.js';
import { addGlyph, fitEmAlone } from '../lib/glyph.js';
import { bob, breathe } from '../lib/liveliness.js';
import { sayLetter, sayLetters } from '../lib/say.js';
import { COLORS, chunkyGlyphEm, familyColor, label } from '../lib/theme.js';
import QuizScene from './QuizScene.js';
import { chooseWeighted, weightOf } from '../lib/mastery.js';

/* What comes next in the alphabet? */

/* Letters shown in the caterpillar, gap included. */
const WINDOW = 5;

const SEGMENT = 104;

/* The area a letter is drawn in inside a caterpillar segment. */
const SEGMENT_BOX = { width: SEGMENT - 34, height: SEGMENT - 40 };
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
    /* Index in `sequence` of the letter being asked for. */
    this.gapIndex = 0;
    /* Where the gap sits in the window: 0 is the oldest letter shown. */
    this.gapSlot = WINDOW - 1;
  }

  onCreated() {
    this.sequence = sequenceFor('alphabetical').filter((id) => letterGlyph(id));
  }

  pickTarget(previous) {
    // The gap only moves off the end once they have a few in a row.
    this.gapSlot = this.streak >= 4 ? Phaser.Math.Between(2, WINDOW - 1) : WINDOW - 1;

    // Enough letters before the gap to show a run, and enough after to fill the window when the gap is not at the end.
    const lowest = WINDOW - 1;
    const highest = this.sequence.length - 1 - (WINDOW - 1 - this.gapSlot);
    // Weight the run by the letter in the gap.
    const places = Array.from({ length: highest - lowest + 1 }, (unused, i) => lowest + i);
    let index = chooseWeighted(places, (at) => weightOf('letter', this.sequence[at]));
    if (this.sequence[index] === previous && highest > lowest) {
      index = index === highest ? index - 1 : index + 1;
    }

    this.gapIndex = index;
    return this.sequence[index];
  }

  lineUpFor(target, count) {
    // Letters already visible in the caterpillar are never offered.
    const shown = new Set(this.window());

    // Nearest neighbours first, so two choices is a real "is it this one or the next one?" rather than an easy pair.
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

  /* The letters visible in the caterpillar, in sequence order. */
  window() {
    const start = this.gapIndex - this.gapSlot;
    return Array.from({ length: WINDOW }, (_, i) => this.sequence[start + i]);
  }

  buildPrompt(layer) {
    const letters = this.window();

    // Start the run at the right, under the caterpillar's head.
    const xFor = (slot) => ((WINDOW - 1) / 2 - slot) * SEGMENT_STEP;

    this.drawHead(layer, xFor(-1));

    // One em along the whole caterpillar.
    const segmentFit = fitEmAlone(
      allLetterGlyphs('isolated'),
      SEGMENT_BOX.width,
      SEGMENT_BOX.height
    );

    letters.forEach((id, slot) => {
      const x = xFor(slot);
      const isGap = slot === this.gapSlot;
      const body = this.add.graphics();

      if (isGap) {
        // A hole in the body rather than a blank space.
        body.fillStyle(0xffffff, 0.85);
        body.fillCircle(x, 0, SEGMENT / 2);
        body.lineStyle(5, COLORS.outline, 0.35);
        body.strokeCircle(x, 0, SEGMENT / 2);
        layer.add(body);
        const mark = this.add
          .text(x, 0, '?', {
            fontFamily: 'system-ui, sans-serif',
            fontSize: '54px',
            fontStyle: '700',
            color: COLORS.inkDim,
          })
          .setOrigin(0.5);
        layer.add(mark);
        // Pulse only the question mark.
        breathe(this, mark, { amount: 0.16, duration: 900 });
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

      layer.add(
        addGlyph(
          this,
          x,
          0,
          `segment:em${Math.round(segmentFit.em)}:${id}`,
          letterGlyph(id, 'isolated'),
          chunkyGlyphEm(segmentFit.em)
        )
      );
    });

    // The whole caterpillar rocks.
    bob(this, layer, { distance: 5, duration: 2400 });

    // Under the gap, not under the middle of the caterpillar: it is pointing at a place, so it has to be next to that place.
    layer.add(
      label(this, xFor(this.gapSlot), SEGMENT / 2 + 34, 'which one goes here?', {
        size: 15,
      })
    );
  }

  /* The caterpillar's face, so the row of letters is an animal. */
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
    // A different em from the caterpillar's segments.
    const fit = fitEmAlone(allLetterGlyphs('isolated'), size - 48, size - 52);
    tile.add(
      addGlyph(this, 0, 0, `seq-choice:em${Math.round(fit.em)}:${id}`,
        letterGlyph(id, 'isolated'), chunkyGlyphEm(fit.em))
    );
  }

  /* Reads the run up to the gap, and stops there. */
  speak() {
    const before = this.window().slice(0, this.gapSlot);
    sayLetters(before.slice(-3));
  }

  /* Now it can be named, because it has been found. */
  onCorrect(id) {
    this.time.delayedCall(400, () => sayLetter(id));
  }
}
