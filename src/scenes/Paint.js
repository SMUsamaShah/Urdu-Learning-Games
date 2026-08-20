import Phaser from 'phaser';
import { letterGlyph, lettersById, sequenceFor } from '../lib/content.js';
import { glyphTexture, glyphWidth } from '../lib/glyph.js';
import * as sfx from '../lib/sfx.js';
import { finished } from '../lib/flourish.js';
import { queueBackdrop } from '../lib/backdrops.js';
import { addStage, wellDone } from '../lib/stage.js';
import { hop, squash } from '../lib/liveliness.js';
import { sparkleBurst, sparkleTrail } from '../lib/particles.js';
import { sayLetter } from '../lib/say.js';
import { COLORS, DESIGN, label, makeButton, PLAY } from '../lib/theme.js';

/**
 * Colour the letter in, in whatever colour you like.
 *
 * ## The one screen with no right answer at all
 *
 * Everything else here has something to get right, however gently. This has
 * nothing: any colour is fine, any order is fine, and it is finished when the
 * child decides it is. That is not a gap in the design — it is the reason to
 * build it. A three-year-old who is tired of being asked questions will still
 * colour something in, and the letter they are colouring is on screen for the
 * whole time they do it.
 *
 * ## How it differs from Trace, which is also a finger inside a letter
 *
 * Trace measures. It has a coverage grid, a threshold and a round that ends
 * when enough of the shape is filled, because its job is fine-motor control.
 * This measures nothing. Its job is time spent looking at a letterform while
 * enjoying yourself, so it counts nothing, ends when the Next button is
 * pressed, and lets a child paint one stroke and move on.
 *
 * ## Inside the lines, for free
 *
 * Paint lands only where the letter is, using the same trick Trace uses: the
 * glyph is rasterised into a canvas texture, and painting draws into that
 * canvas with `destination-atop`, so pixels outside the letterform are simply
 * never touched. No mask is needed — which matters, because Phaser 4 dropped
 * bitmap masks — and a child scrubbing wildly across the screen still produces
 * a neatly coloured letter.
 */

const LETTER_HEIGHT = 380;
/** The glyph rasteriser supersamples by this much; the canvas is kept at it. */
const SUPER = 3;
const BRUSH = 34;

/** The palette. Bright, well separated, and none of them near the background. */
const PAINTS = [
  0xe23b4e, 0xf08c1e, 0xf3c62b, 0x4aa657, 0x2f8fd4, 0x8a5fc9, 0xe86ba8, 0x4a3b2f,
];

export default class Paint extends Phaser.Scene {
  constructor() {
    super('Paint');
    /** @type {string[]} */
    this.sequence = [];
    this.index = 0;
    this.colour = PAINTS[0];
    this.painting = false;
    /** Whether anything has been painted on this letter yet. */
    this.touched = false;
  }

  preload() {
    queueBackdrop(this);
  }

  create() {
    this.sequence = sequenceFor('alphabetical').filter((id) => letterGlyph(id));
    this.index = 0;

    this.stage = addStage(this, {
      hills: false,
      instruction: 'colour-in',
      roman: 'Colour it in',
    });
    this.banner = this.stage.banner;
    this.rail = this.stage.rail;

    makeButton(this, {
      x: DESIGN.width - 250,
      y: 56,
      width: 150,
      height: 64,
      color: COLORS.panel,
      onTap: () => this.buildLetter(),
    }).add(label(this, 0, 0, 'Start again', { size: 15, color: COLORS.ink }));

    makeButton(this, {
      x: DESIGN.width - 90,
      y: 56,
      width: 130,
      height: 64,
      color: COLORS.accent,
      onTap: () => this.nextLetter(),
    }).add(label(this, 0, 0, 'Next →', { size: 16, color: COLORS.onColor }));

    this.layer = this.add.container(0, 0);
    this.buildPalette();
    this.buildLetter();
    this.attachPainting();

    this.events.once('shutdown', () => {
      this.trail?.destroy();
      this.trail = null;
    });
  }

  get letterId() {
    return this.sequence[this.index];
  }

  // ---------------------------------------------------------------- palette

  buildPalette() {
    const step = 78;
    const startX = PLAY.centerX + ((PAINTS.length - 1) * step) / 2;
    this.pots = [];

    PAINTS.forEach((colour, index) => {
      const pot = makeButton(this, {
        x: startX - index * step,
        y: DESIGN.height - 72,
        width: 64,
        height: 64,
        color: colour,
        shape: 'circle',
        onTap: () => this.pick(pot),
      });
      pot.colour = colour;
      pot.on('pointerdown', () => squash(this, pot));
      this.pots.push(pot);
    });

    // A ring marking the pot in hand, moved rather than redrawn.
    this.chosen = this.add.graphics();
    this.pick(this.pots[0]);
  }

  pick(pot) {
    this.colour = pot.colour;
    sfx.tap();
    hop(this, pot, { height: 10 });
    this.chosen.clear();
    this.chosen.lineStyle(6, 0xffffff, 1);
    this.chosen.strokeCircle(pot.x, pot.y, 42);
    this.chosen.lineStyle(3, COLORS.outline, 0.6);
    this.chosen.strokeCircle(pot.x, pot.y, 42);
  }

  // ----------------------------------------------------------------- letter

  buildLetter() {
    this.layer.removeAll(true);
    this.touched = false;
    this.painting = false;

    const id = this.letterId;
    const glyph = letterGlyph(id, 'isolated');
    const width = glyphWidth(glyph, LETTER_HEIGHT);
    this.centre = { x: PLAY.centerX, y: 350 };
    this.half = { w: width / 2, h: LETTER_HEIGHT / 2 };

    // The letter as an outline to colour inside, in the palest possible ink.
    const outlineKey = `paint:outline:${id}:${LETTER_HEIGHT}`;
    glyphTexture(this, outlineKey, glyph, { height: LETTER_HEIGHT, color: '#ffffff' });
    const source = this.textures.get(outlineKey).getSourceImage();

    // A fresh canvas per letter, seeded with the white letterform. Paint is
    // drawn into it with destination-atop, so it can only land where the letter
    // already is — which is what keeps a wild scribble inside the lines.
    const liveKey = 'paint:live';
    if (this.textures.exists(liveKey)) this.textures.remove(liveKey);
    const live = this.textures.createCanvas(liveKey, source.width, source.height);
    live.context.drawImage(source, 0, 0);
    live.refresh();
    this.canvas = live;

    this.layer.add(
      this.add.image(this.centre.x, this.centre.y, liveKey).setScale(1 / SUPER)
    );

    // The letter's edge, over the paint, so the shape stays readable however
    // it is coloured.
    const edgeKey = `paint:edge:${id}:${LETTER_HEIGHT}`;
    glyphTexture(this, edgeKey, glyph, {
      height: LETTER_HEIGHT,
      color: 'transparent',
      stroke: COLORS.outlineCss,
      strokeWidth: 3,
    });
    this.layer.add(
      this.add.image(this.centre.x, this.centre.y, edgeKey).setScale(1 / SUPER)
    );

    this.layer.add(
      label(this, this.centre.x, this.centre.y + LETTER_HEIGHT / 2 + 26,
        lettersById.get(id).roman, { size: 22 })
    );

    sayLetter(id, { word: false });
  }

  // ---------------------------------------------------------------- painting

  attachPainting() {
    this.input.on('pointerdown', (pointer) => {
      if (!this.insideLetter(pointer)) return;
      this.painting = true;
      this.dab(pointer);
    });
    this.input.on('pointermove', (pointer) => {
      if (!this.painting || !pointer.isDown) return;
      this.dab(pointer);
    });
    this.input.on('pointerup', () => {
      this.painting = false;
      this.canvas?.refresh();
    });

    this.trail = sparkleTrail(this, { tint: 0xffffff });
  }

  /** Whether a pointer is over the letter's box at all. */
  insideLetter(pointer) {
    return (
      Math.abs(pointer.worldX - this.centre.x) < this.half.w + BRUSH &&
      Math.abs(pointer.worldY - this.centre.y) < this.half.h + BRUSH
    );
  }

  dab(pointer) {
    const ctx = this.canvas.context;
    // Canvas coordinates: the image is drawn at 1/SUPER, centred.
    const x = (pointer.worldX - this.centre.x) * SUPER + this.canvas.width / 2;
    const y = (pointer.worldY - this.centre.y) * SUPER + this.canvas.height / 2;

    ctx.save();
    // Only where the letter already is. Everything outside it is untouched, so
    // there are no lines to stay inside — the shape does it.
    ctx.globalCompositeOperation = 'source-atop';
    ctx.fillStyle = '#' + this.colour.toString(16).padStart(6, '0');
    ctx.beginPath();
    ctx.arc(x, y, BRUSH * SUPER * 0.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    this.canvas.refresh();
    this.trail?.emitParticleAt(pointer.worldX, pointer.worldY, 1);

    if (!this.touched) {
      this.touched = true;
      sfx.sparkle();
    }
  }

  /**
   * On to the next letter.
   *
   * Celebrates only if something was actually painted. A child pressing Next
   * repeatedly to flick through the alphabet should not be congratulated eight
   * times for doing nothing, and a celebration that fires for nothing is one
   * that stops meaning anything.
   */
  nextLetter() {
    sfx.swoosh();
    if (this.touched) {
      finished();
      sparkleBurst(this, this.centre.x, this.centre.y, { count: 40, speed: 380 });
      wellDone(this, this.stage, { duration: 1800 });
      this.time.delayedCall(900, () => this.step());
      return;
    }
    this.step();
  }

  step() {
    this.index = (this.index + 1) % this.sequence.length;
    this.banner.setInstruction('colour-in', 'Colour it in');
    this.buildLetter();
  }
}
