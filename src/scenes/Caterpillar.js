import Phaser from 'phaser';
import { allLetterGlyphs, letterGlyph, sequenceFor } from '../lib/content.js';
import { addGlyph, fitEmAlone } from '../lib/glyph.js';
import * as sfx from '../lib/sfx.js';
import { finished, rightAnswer, wrongAnswer } from '../lib/flourish.js';
import { dance } from '../lib/celebrate.js';
import { queueBackdrop } from '../lib/backdrops.js';
import { addStage, wellDone } from '../lib/stage.js';
import { bob, hop, popIn, squash } from '../lib/liveliness.js';
import { sparkleBurst } from '../lib/particles.js';
import { sayLetter, sayLetters } from '../lib/say.js';
import { COLORS, DESIGN, makeButton } from '../lib/theme.js';

/**
 * Put the missing letters back into the caterpillar.
 *
 * ## How this differs from Sequence, which is also about order
 *
 * Sequence shows five letters with one hole and asks what belongs in it. This
 * shows a long run with three holes and a tray to fill them from. Two things
 * change, and both make it harder in the way a child should get harder at:
 *
 *   1. **A run, not a window.** Twelve letters is long enough to be recited
 *      rather than reasoned about, which is what knowing an alphabet actually
 *      is. Five is short enough to solve by looking at the neighbours.
 *   2. **Choosing where it goes, not only what it is.** The tray holds more
 *      letters than there are holes, so a letter has to be matched to a
 *      *place*. Sequence never asks that.
 *
 * ## One hole at a time, and it glows
 *
 * The holes fill in reading order, right to left, and the one being asked for
 * is marked. Letting a child pick any hole and any letter is two decisions per
 * move and a much older child's game; marking the next one makes it one tap,
 * which is right for three, and it is also how the run is read aloud when the
 * board is finished.
 *
 * Written right to left throughout — the caterpillar's head is on the right,
 * because that is where the alphabet starts.
 */

/** Letters in the run, holes in it, and letters in the tray, by round. */
const ROUNDS = [
  { run: 8, holes: 2, tray: 4 },
  { run: 10, holes: 3, tray: 5 },
  { run: 12, holes: 3, tray: 5 },
  { run: 12, holes: 4, tray: 6 },
];

const SEGMENT = 96;
const GAP = 10;
/** Where the caterpillar's body is drawn. Clear of the ribbon and the tray. */
const BODY = { top: 210, right: DESIGN.width - 60, left: 250 };
const TRAY_Y = DESIGN.height - 110;

export default class Caterpillar extends Phaser.Scene {
  constructor(key = 'Caterpillar') {
    // Takes its key so a subclass can be a different scene with the same
    // machinery — see NumberLine. Phaser reads the key from the Scene
    // constructor, so it cannot be set afterwards.
    super(key);
    /** @type {string[]} */
    this.sequence = [];
    this.round = 0;
    /** @type {string[]} the run being shown, in alphabet order */
    this.run = [];
    /** @type {number[]} indexes into `run` that are holes, in filling order */
    this.holes = [];
    this.filled = 0;
    this.locked = false;
  }

  preload() {
    queueBackdrop(this);
  }

  /**
   * The run to draw from, the glyph for one of its items, and the whole set the
   * em is measured against.
   *
   * Three hooks rather than one, because a subclass swapping the alphabet for
   * the numerals has to change all three together and nothing else — see
   * NumberLine, which is this game with ۰..۹ in it. Everything below is written
   * against these and never against `letterGlyph` directly.
   */
  items() {
    return sequenceFor('alphabetical').filter((id) => letterGlyph(id));
  }

  glyphFor(id) {
    return letterGlyph(id, 'isolated');
  }

  allGlyphs() {
    return allLetterGlyphs('isolated');
  }

  /** Texture keys are namespaced per scene, or two runs would share a size. */
  get keyPrefix() {
    return 'caterpillar';
  }

  create() {
    this.sequence = this.items();
    this.round = 0;

    this.stage = addStage(this, {
      instruction: this.instruction ?? 'fill-gaps',
      roman: this.instructionRoman ?? 'Fill the gaps',
    });
    this.banner = this.stage.banner;
    this.plant = this.stage.plant;

    this.body = this.add.container(0, 0);
    this.tray = this.add.container(0, 0);

    this.newRound();
  }

  // ------------------------------------------------------------------ round

  newRound() {
    this.body.removeAll(true);
    this.tray.removeAll(true);
    this.filled = 0;
    this.locked = false;
    this.banner.setInstruction(this.instruction ?? 'fill-gaps', this.instructionRoman ?? 'Fill the gaps');

    const plan = this.rounds[Math.min(this.round, this.rounds.length - 1)];
    const length = Math.min(plan.run, this.sequence.length);
    const start = Phaser.Math.Between(0, this.sequence.length - length);
    this.run = this.sequence.slice(start, start + length);

    // Never the first or last of the run: a hole at either end can be answered
    // by carrying on in one direction, which is the easier question Sequence
    // already asks.
    const inner = Phaser.Utils.Array.Shuffle(
      Array.from({ length: length - 2 }, (_, i) => i + 1)
    );
    this.holes = inner.slice(0, plan.holes).sort((a, b) => a - b);

    // Distractors from just outside the run, so a wrong tray letter is a
    // plausible neighbour rather than something from the far end.
    const answers = this.holes.map((i) => this.run[i]);
    const nearby = Phaser.Utils.Array.Shuffle(
      this.sequence.filter((id) => !this.run.includes(id))
    ).slice(0, Math.max(0, plan.tray - answers.length));

    this.buildBody();
    this.buildTray(Phaser.Utils.Array.Shuffle([...answers, ...nearby]));
    this.markNext();
  }

  /** How long the run is and how many holes it has, per round. */
  get rounds() {
    return ROUNDS;
  }

  /** The em every letter on this screen is drawn at, tray and body alike. */
  letterEm(box) {
    return fitEmAlone(this.allGlyphs(), box, box).em;
  }

  buildBody() {
    const step = SEGMENT + GAP;
    // Two rows if the run will not fit across the screen at a readable size.
    const perRow = Math.min(this.run.length, Math.floor((BODY.right - BODY.left) / step));
    const rows = Math.ceil(this.run.length / perRow);
    const em = this.letterEm(SEGMENT - 30);
    this.segments = [];

    this.run.forEach((id, index) => {
      const row = Math.floor(index / perRow);
      const column = index % perRow;
      const inRow = Math.min(this.run.length - row * perRow, perRow);
      // Right to left: the alphabet starts at the right-hand end.
      const rowWidth = inRow * step - GAP;
      const rightEdge = (BODY.left + BODY.right) / 2 + rowWidth / 2;
      const x = rightEdge - column * step - SEGMENT / 2;
      const y = BODY.top + row * (SEGMENT + 22) + SEGMENT / 2;

      const isHole = this.holes.includes(index);
      const segment = this.add.container(x, y);
      const plate = this.add.graphics();
      segment.add(plate);
      segment.plate = plate;
      segment.index = index;
      segment.letterId = id;
      segment.isHole = isHole;
      this.paintSegment(segment, isHole ? null : id, em, false);

      this.body.add(segment);
      this.segments.push(segment);
      popIn(this, segment, { delay: index * 45, duration: 260 });
      if (rows > 0) this.time.delayedCall(index * 45 + 20, () => sfx.boing());
    });
  }

  /**
   * Paints one segment: a filled letter, an empty hole, or the hole being asked
   * for. Redrawn rather than tweened, because a hole becoming a letter is a
   * change of what the thing *is*.
   */
  paintSegment(segment, letterId, em, wanted) {
    segment.plate.clear();
    const half = SEGMENT / 2;
    if (letterId) {
      segment.plate.fillStyle(COLORS.shadow, 0.18);
      segment.plate.fillCircle(0, 5, half);
      segment.plate.fillStyle(COLORS.card, 1);
      segment.plate.fillCircle(0, 0, half);
      // A quiet ring on a filled segment. Only the hole being asked for gets
      // the accent colour: if everything on the board is ringed in orange then
      // nothing is, and which one to answer next is the whole instruction.
      segment.plate.lineStyle(4, COLORS.outline, 0.5);
      segment.plate.strokeCircle(0, 0, half);
      segment.glyph?.destroy();
      segment.glyph = addGlyph(
        this,
        0,
        0,
        `${this.keyPrefix}:em${Math.round(em)}:${letterId}`,
        this.glyphFor(letterId),
        { em, color: COLORS.ink }
      );
      segment.add(segment.glyph);
      return;
    }
    // An empty socket: a dashed ring rather than a blank, so it reads as
    // somewhere a letter goes rather than as the end of the caterpillar.
    segment.plate.fillStyle(0xffffff, wanted ? 0.8 : 0.35);
    segment.plate.fillCircle(0, 0, half);
    segment.plate.lineStyle(wanted ? 7 : 3, wanted ? COLORS.accent : COLORS.outline, wanted ? 1 : 0.45);
    segment.plate.strokeCircle(0, 0, half - 2);

    // And it breathes. A ring that is merely a different colour is a difference
    // a three-year-old has to be told about; one that moves is the only thing
    // on the board doing so, and it is the answer to "where does this go?".
    segment.pulse?.stop();
    segment.setScale(1);
    if (wanted) segment.pulse = bob(this, segment, { distance: 5, duration: 1100 });
  }

  buildTray(ids) {
    const step = 130;
    const startX = DESIGN.width / 2 + ((ids.length - 1) * step) / 2;
    const em = this.letterEm(96);

    ids.forEach((id, index) => {
      const tile = makeButton(this, {
        x: startX - index * step,
        y: TRAY_Y,
        width: 116,
        height: 116,
        color: COLORS.panelLight,
        onTap: () => this.tap(tile),
      });
      tile.letterId = id;
      tile.used = false;
      tile.add(
        addGlyph(
          this,
          0,
          0,
          `${this.keyPrefix}-tray:em${Math.round(em)}:${id}`,
          this.glyphFor(id),
          { em, color: COLORS.ink }
        )
      );
      tile.on('pointerdown', () => squash(this, tile));
      this.tray.add(tile);
      popIn(this, tile, { delay: 300 + index * 60, duration: 280 });
      tile.idle = bob(this, tile, { distance: 4, duration: 2100, delay: index * 180 });
    });
  }

  // ------------------------------------------------------------------- play

  /** The hole being asked for, or null once they are all filled. */
  get nextHole() {
    return this.holes[this.filled] ?? null;
  }

  markNext() {
    const em = this.letterEm(SEGMENT - 30);
    for (const segment of this.segments) {
      if (!segment.isHole || segment.filledWith) continue;
      this.paintSegment(segment, null, em, segment.index === this.nextHole);
    }
  }

  tap(tile) {
    if (this.locked || tile.used) return;
    const hole = this.nextHole;
    if (hole === null) return;

    const wanted = this.run[hole];
    if (tile.letterId !== wanted) {
      wrongAnswer();
      this.plant?.wonder();
      this.tweens.add({
        targets: tile,
        x: tile.x + 8,
        duration: 60,
        yoyo: true,
        repeat: 2,
        ease: 'Sine.easeInOut',
      });
      // Nothing is taken away and nothing is marked wrong. The tray letter is
      // still there to be tried again once they have looked at the run.
      return;
    }

    tile.used = true;
    tile.disableInteractive();
    tile.idle?.stop();
    rightAnswer();
    sfx.sparkle();

    const segment = this.segments.find((s) => s.index === hole);
    // The tray letter flies to its place rather than vanishing and reappearing:
    // the whole lesson is that it belongs *there*.
    this.tweens.add({
      targets: tile,
      x: segment.x,
      y: segment.y,
      scaleX: 0.8,
      scaleY: 0.8,
      alpha: 0,
      duration: 340,
      ease: 'Quad.easeInOut',
      onComplete: () => {
        segment.filledWith = wanted;
        this.paintSegment(segment, wanted, this.letterEm(SEGMENT - 30), false);
        sparkleBurst(this, segment.x, segment.y, {
          count: 16,
          tint: [COLORS.correct, 0xffffff],
        });
        hop(this, segment, { height: 14 });
        dance(this, segment);
        this.say(wanted);

        this.filled++;
        if (this.filled < this.holes.length) return this.markNext();
        this.finish();
      },
    });
  }

  /**
   * The run is whole. Reading it aloud is the reward.
   *
   * Saying the whole run rather than the last letter is the point of the game:
   * the letters were always in order, and hearing them in order is what makes
   * that an alphabet rather than a row of shapes.
   */
  /** How one item is named, and how the finished run is read out. */
  say(id) {
    sayLetter(id, { word: false });
  }

  sayRun(ids) {
    sayLetters(ids);
  }

  finish() {
    this.locked = true;
    finished();
    this.sayRun(this.run);
    this.time.delayedCall(700, () => {
      wellDone(this, this.stage, { duration: 2600 });
      this.round++;
      this.time.delayedCall(2400, () => this.newRound());
    });
  }
}
