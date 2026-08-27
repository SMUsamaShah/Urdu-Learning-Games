import Phaser from 'phaser';
import { allLetterGlyphs, letterGlyph, sequenceFor } from '../lib/content.js';
import { addGlyph, fitEmAlone } from '../lib/glyph.js';
import { caterpillar as drawCaterpillar } from '../lib/props.js';
import * as sfx from '../lib/sfx.js';
import { finished, rightAnswer, wrongAnswer } from '../lib/flourish.js';
import { dance } from '../lib/celebrate.js';
import { queueBackdrop } from '../lib/backdrops.js';
import { addStage, wellDone } from '../lib/stage.js';
import { armDragging, carry, nearest, refuse, swimHome } from '../lib/dragging.js';
import { bob, hop, popIn } from '../lib/liveliness.js';
import { sparkleBurst } from '../lib/particles.js';
import { sayLetter, sayLetters } from '../lib/say.js';
import { COLORS, DESIGN, RAIL_EDGE, makeButton, PLAY } from '../lib/theme.js';
import { chooseWeighted, weightOf } from '../lib/mastery.js';

/* Put the missing letters back into the caterpillar. */

/* Letters in the run, holes in it, and letters in the tray, by round. */
const ROUNDS = [
  { run: 8, holes: 2, tray: 4 },
  { run: 10, holes: 3, tray: 5 },
  { run: 12, holes: 3, tray: 5 },
  { run: 12, holes: 4, tray: 6 },
];

const SEGMENT = 96;
const GAP = 10;
/* Where the caterpillar's body is drawn. */
const BODY = { top: 210, right: DESIGN.width - 60, left: RAIL_EDGE };
const TRAY_Y = DESIGN.height - 110;

export default class Caterpillar extends Phaser.Scene {
  constructor(key = 'Caterpillar') {
    // Takes its key so a subclass can be a different scene with the same machinery — see NumberLine.
    super(key);
    /* Whether the row of segments is drawn as a creature. */
    this.showCreature = key === 'Caterpillar';
    /* What `sequence` holds ids of, for mastery.js. */
    this.subjectKind = key === 'Caterpillar' ? 'letter' : 'number';
    /** @type {string[]} */
    this.sequence = [];
    this.round = 0;
    /** @type {string[]} */
    this.run = [];
    /** @type {number[]} indexes */
    this.holes = [];
    this.filled = 0;
    this.locked = false;
  }

  preload() {
    queueBackdrop(this);
  }

  /* The run to draw from, the glyph for one of its items, and the whole set the em is measured against. */
  items() {
    return sequenceFor('alphabetical').filter((id) => letterGlyph(id));
  }

  glyphFor(id) {
    return letterGlyph(id, 'isolated');
  }

  allGlyphs() {
    return allLetterGlyphs('isolated');
  }

  /* Texture keys are namespaced per scene, or two runs would share a size. */
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
    this.rail = this.stage.rail;

    this.body = this.add.container(0, 0);
    this.tray = this.add.container(0, 0);

    armDragging(this, {
      canLift: (tile) => !this.locked && !tile.used,
      onDrop: (tile) => this.drop(tile),
    });

    this.newRound();
  }

  newRound() {
    this.body.removeAll(true);
    this.tray.removeAll(true);
    this.filled = 0;
    this.locked = false;
    this.banner.setInstruction(this.instruction ?? 'fill-gaps', this.instructionRoman ?? 'Fill the gaps');

    const plan = this.rounds[Math.min(this.round, this.rounds.length - 1)];
    const length = Math.min(plan.run, this.sequence.length);
    const start = this.pickStart(length);
    this.run = this.sequence.slice(start, start + length);

    // Never the first or last of the run.
    const inner = Phaser.Utils.Array.Shuffle(
      Array.from({ length: length - 2 }, (_, i) => i + 1)
    );
    this.holes = inner.slice(0, plan.holes).sort((a, b) => a - b);

    // Distractors from just outside the run.
    const answers = this.holes.map((i) => this.run[i]);
    const nearby = Phaser.Utils.Array.Shuffle(
      this.sequence.filter((id) => !this.run.includes(id))
    ).slice(0, Math.max(0, plan.tray - answers.length));

    this.buildBody();
    this.buildTray(Phaser.Utils.Array.Shuffle([...answers, ...nearby]));
    this.markNext();
  }

  /* How long the run is and how many holes it has, per round. */
  get rounds() {
    return ROUNDS;
  }

  /* The em every letter on this screen is drawn at, tray and body alike. */
  letterEm(box) {
    return fitEmAlone(this.allGlyphs(), box, box).em;
  }

  buildBody() {
    const step = SEGMENT + GAP;
    // The head sticks out past the first segment.
    const headRoom = this.showCreature ? SEGMENT * 1.6 : 0;
    const right = BODY.right - headRoom;
    // Two rows if the run will not fit across the screen at a readable size.
    const perRow = Math.min(this.run.length, Math.floor((right - BODY.left) / step));
    const rows = Math.ceil(this.run.length / perRow);
    const em = this.letterEm(SEGMENT - 30);
    this.segments = [];

    // Where every segment goes.
    const places = this.run.map((id, index) => {
      const row = Math.floor(index / perRow);
      const column = index % perRow;
      const inRow = Math.min(this.run.length - row * perRow, perRow);
      // Right to left: the alphabet starts at the right-hand end.
      const rowWidth = inRow * step - GAP;
      const rightEdge = (BODY.left + right) / 2 + rowWidth / 2;
      return {
        x: rightEdge - column * step - SEGMENT / 2,
        y: BODY.top + row * (SEGMENT + 22) + SEGMENT / 2,
      };
    });

    // Draw the caterpillar behind the letter slots.
    if (this.showCreature) {
      const creature = drawCaterpillar(this, places, SEGMENT / 2);
      if (creature) this.body.add(creature);
    }

    this.run.forEach((id, index) => {
      const { x, y } = places[index];

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

  /* Paints one segment: a filled letter, an empty hole, or the hole being asked for. */
  paintSegment(segment, letterId, em, wanted) {
    segment.plate.clear();
    const half = SEGMENT / 2;
    if (letterId) {
      segment.plate.fillStyle(COLORS.shadow, 0.18);
      segment.plate.fillCircle(0, 5, half);
      segment.plate.fillStyle(COLORS.card, 1);
      segment.plate.fillCircle(0, 0, half);
      // A quiet ring on a filled segment.
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
    // Mark the empty socket with a dashed ring.
    segment.plate.fillStyle(0xffffff, wanted ? 0.8 : 0.35);
    segment.plate.fillCircle(0, 0, half);
    segment.plate.lineStyle(wanted ? 7 : 3, wanted ? COLORS.accent : COLORS.outline, wanted ? 1 : 0.45);
    segment.plate.strokeCircle(0, 0, half - 2);

    // And it breathes.
    segment.pulse?.stop();
    segment.setScale(1);
    if (wanted) segment.pulse = bob(this, segment, { distance: 5, duration: 1100 });
  }

  buildTray(ids) {
    const step = 130;
    const startX = PLAY.centerX + ((ids.length - 1) * step) / 2;
    const em = this.letterEm(96);

    ids.forEach((id, index) => {
      const tile = makeButton(this, {
        x: startX - index * step,
        y: TRAY_Y,
        width: 116,
        height: 116,
        color: COLORS.panelLight,
        // Dragged, not tapped: the press tween would fight the lift.
        press: false,
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
      this.tray.add(tile);
      popIn(this, tile, { delay: 300 + index * 60, duration: 280 });
      tile.idle = bob(this, tile, { distance: 4, duration: 2100, delay: index * 180 });
      // Armed once it has landed.
      this.time.delayedCall(300 + index * 60 + 300, () => carry(this, tile));
    });
  }

  /* Where the run starts, weighted by what is in it. */
  pickStart(length) {
    const starts = Array.from({ length: this.sequence.length - length + 1 }, (unused, i) => i);
    return chooseWeighted(starts, (start) => {
      let sum = 0;
      for (let i = start; i < start + length; i++) sum += weightOf(this.subjectKind, this.sequence[i]);
      return sum / length;
    });
  }

  /* The hole being asked for, or null once they are all filled. */
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

  /* A letter has been let go somewhere. */
  drop(tile) {
    if (this.locked || tile.used) return swimHome(this, tile);
    const hole = this.nextHole;
    if (hole === null) return swimHome(this, tile);

    const segment = this.segments.find((s) => s.index === hole);
    // Dropped in mid-air, or nowhere near a gap: back to the tray, no comment.
    if (!segment || !nearest([segment], tile)) return swimHome(this, tile);

    const wanted = this.run[hole];
    if (tile.letterId !== wanted) {
      wrongAnswer({ subject: { kind: this.subjectKind, id: wanted } });
      this.rail?.wonder();
      // Refused rather than punished.
      refuse(this, tile, segment);
      return;
    }

    tile.used = true;
    tile.disableInteractive();
    tile.idle?.stop();
    rightAnswer({ kind: this.subjectKind, id: tile.letterId });
    sfx.sparkle();

    // The last few pixels are done for them, so a drag that was close enough lands square in the gap.
    this.tweens.add({
      targets: tile,
      x: segment.x,
      y: segment.y,
      scale: 0.8,
      alpha: 0,
      duration: 220,
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

  /* The run is whole. */
  /* How one item is named, and how the finished run is read out. */
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
