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

/* Colour the letter in, in whatever colour you like. */

const LETTER_HEIGHT = 380;
/* The glyph rasteriser supersamples by this much; the canvas is kept at it. */
const SUPER = 3;
const BRUSH = 34;

/* The palette. */
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
    /* Whether anything has been painted on this letter yet. */
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

    // A fresh canvas per letter, seeded with the white letterform.
    const liveKey = 'paint:live';
    if (this.textures.exists(liveKey)) this.textures.remove(liveKey);
    const live = this.textures.createCanvas(liveKey, source.width, source.height);
    live.context.drawImage(source, 0, 0);
    live.refresh();
    this.canvas = live;

    this.layer.add(
      this.add.image(this.centre.x, this.centre.y, liveKey).setScale(1 / SUPER)
    );

    // The letter's edge, over the paint, so the shape stays readable however it is coloured.
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

  /* Whether a pointer is over the letter's box at all. */
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
    // Restrict the effect to the existing letter.
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

  /* On to the next letter. */
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
