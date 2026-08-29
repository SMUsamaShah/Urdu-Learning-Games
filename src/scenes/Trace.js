import Phaser from 'phaser';
import { letterGlyph, lettersById, sequenceFor } from '../lib/content.js';
import { glyphTexture, glyphWidth } from '../lib/glyph.js';
import { stopAll } from '../lib/audio.js';
import * as sfx from '../lib/sfx.js';
import { finished } from '../lib/flourish.js';
import { confetti } from '../lib/celebrate.js';
import { queueBackdrop } from '../lib/backdrops.js';
import { addStage, wellDone } from '../lib/stage.js';
import { createGuide } from '../lib/guided-trace.js';
import { hasStrokes } from '../lib/strokes.js';
import { sayLetter } from '../lib/say.js';
import { sparkleTrail, sparkleBurst } from '../lib/particles.js';
import { COLORS, DESIGN, RAIL_EDGE, familyColor, label, makeButton, PLAY } from '../lib/theme.js';

/* Writing the letter with a finger. */

/* The glyph rasteriser supersamples by this much. */
const SUPER = 3;

/* Display height of the letter being traced. */
const GLYPH_HEIGHT = 400;
/* Grid cell size in display pixels. */
const CELL = 13;
/* Fraction of the letter that counts as done. */
const DONE_AT = 0.7;
const BRUSH_RADIUS = 26;

export default class Trace extends Phaser.Scene {
  constructor() {
    super('Trace');
    /** @type {string[]} */
    this.sequence = [];
    this.index = 0;
    this.locked = false;
    this.drawing = false;
    /** @type {{inside: boolean, covered: boolean}[][]} */
    this.grid = [];
    this.insideCount = 0;
    this.coveredCount = 0;
  }

  preload() {
    queueBackdrop(this);
  }

  create() {
    this.sequence = sequenceFor('alphabetical').filter((id) => letterGlyph(id));
    this.index = 0;

    this.stage = addStage(this, {
      hills: false,
      instruction: 'fill-letter',
      roman: 'Fill the letter',
    });
    this.banner = this.stage.banner;
    this.rail = this.stage.rail;

    // Place controls beside the progress bar.
    makeButton(this, {
      x: RAIL_EDGE + 106,
      y: DESIGN.height - 49,
      width: 150,
      height: 64,
      color: COLORS.panel,
      onTap: () => this.reset(),
    }).add(label(this, 0, 0, 'Start again', { size: 15, color: COLORS.ink }));

    makeButton(this, {
      x: DESIGN.width - 250,
      y: DESIGN.height - 49,
      width: 130,
      height: 64,
      color: COLORS.accent,
      onTap: () => this.nextLetter(),
    }).add(label(this, 0, 0, 'Next →', { size: 16, color: COLORS.onColor }));

    this.layer = this.add.container(0, 0);
    this.progressBar = this.add.graphics();

    this.buildLetter();
    this.attachDrawing();

    // addStage already stops any voice on shutdown.
    this.events.once('shutdown', () => {
      this.trail?.destroy();
      this.trail = null;
    });
  }

  get letterId() {
    return this.sequence[this.index];
  }

  buildLetter() {
    this.layer.removeAll(true);
    this.locked = false;
    this.drawing = false;
    this.cover = null;

    const id = this.letterId;
    const glyph = letterGlyph(id, 'isolated');
    const letter = lettersById.get(id);
    const tint = familyColor(letter.shapeFamily);
    const tintCss = '#' + tint.toString(16).padStart(6, '0');

    const width = glyphWidth(glyph, GLYPH_HEIGHT);
    const centreX = PLAY.centerX;
    const centreY = 380;
    const left = centreX - width / 2;
    const top = centreY - GLYPH_HEIGHT / 2;

    // Where the glyph's own bounding box lands on screen, and how big a font unit is there.
    const inset = GLYPH_HEIGHT * 0.06;
    this.glyphScale = (GLYPH_HEIGHT - inset * 2) / glyph.bbox[3];
    this.glyphOrigin = { x: left + inset, y: top + inset };
    this.guided = hasStrokes(id);

    // Three layers, bottom to top: 1.
    const filledKey = `trace:filled:${id}:${GLYPH_HEIGHT}`;
    glyphTexture(this, filledKey, glyph, { height: GLYPH_HEIGHT, color: tintCss });
    this.layer.add(this.add.image(centreX, centreY, filledKey).setScale(1 / SUPER));

    // Guided mode does not cover the letter up.
    if (this.guided) {
      this.layer.list[this.layer.list.length - 1].setAlpha(0.22);
    } else {
      // Opaque, and only a shade off the background: it has to hide the coloured letter completely or the round starts.
      const coverKey = `trace:cover:${id}:${GLYPH_HEIGHT}`;
      glyphTexture(this, coverKey, glyph, {
        height: GLYPH_HEIGHT,
        color: '#f6ead2',
      });
      const source = this.textures.get(coverKey).getSourceImage();

      // A fresh canvas per letter, seeded with the pale shape and then eaten away.
      const liveKey = 'trace:live';
      if (this.textures.exists(liveKey)) this.textures.remove(liveKey);
      const live = this.textures.createCanvas(liveKey, source.width, source.height);
      live.context.drawImage(source, 0, 0);
      live.refresh();
      this.cover = live;
      this.coverDirty = false;
      this.layer.add(this.add.image(centreX, centreY, liveKey).setScale(1 / SUPER));
    }

    const outlineKey = `trace:outline:${id}:${GLYPH_HEIGHT}`;
    glyphTexture(this, outlineKey, glyph, {
      height: GLYPH_HEIGHT,
      color: 'rgba(0,0,0,0)',
      stroke: 'rgba(43,48,71,0.55)',
      strokeWidth: 2,
    });
    this.layer.add(this.add.image(centreX, centreY, outlineKey).setScale(1 / SUPER));

    this.inkOrigin = { x: left, y: top };
    this.inkSize = { width, height: GLYPH_HEIGHT };

    this.guide?.destroy();
    this.guide = null;
    if (this.guided) {
      // Added after the outline so the ink sits over the letter's edge.
      this.guide = createGuide(this, {
        letterId: id,
        scale: this.glyphScale,
        origin: this.glyphOrigin,
        bbox: glyph.bbox,
        colour: tintCss,
        onFinished: () => this.finishLetter(),
      });
      this.banner.setInstruction('trace-letter', 'Follow the line');
    } else {
      // Read from the opaque fill, not the pale cover: the cover's alpha is a tenth, which no sane ink threshold would accept.
      this.buildGrid(filledKey, width);
      this.banner.setInstruction('fill-letter', 'Fill the letter');
    }
    this.drawProgress(0);

    this.layer.add(
      label(this, centreX, centreY + GLYPH_HEIGHT / 2 + 46, letter.roman, {
        size: 26,
        color: COLORS.ink,
      })
    );

    // Name, sound, then the word.
    sayLetter(id, { sound: true });
  }

  /* Reads the rasterised letter once and records which cells are ink. */
  buildGrid(maskKey, width) {
    const source = this.textures.get(maskKey).getSourceImage();
    const ctx = source.getContext('2d');
    const pixels = ctx.getImageData(0, 0, source.width, source.height).data;

    // The texture is supersampled; map display cells onto it.
    const scaleX = source.width / width;
    const scaleY = source.height / GLYPH_HEIGHT;

    this.cols = Math.max(1, Math.floor(width / CELL));
    this.rows = Math.max(1, Math.floor(GLYPH_HEIGHT / CELL));
    this.grid = [];
    this.insideCount = 0;
    this.coveredCount = 0;

    for (let row = 0; row < this.rows; row++) {
      const line = [];
      for (let col = 0; col < this.cols; col++) {
        const px = Math.floor((col + 0.5) * CELL * scaleX);
        const py = Math.floor((row + 0.5) * CELL * scaleY);
        const alpha =
          px < source.width && py < source.height
            ? pixels[(py * source.width + px) * 4 + 3]
            : 0;
        const inside = alpha > 128;
        if (inside) this.insideCount++;
        line.push({ inside, covered: false });
      }
      this.grid.push(line);
    }
  }

  attachDrawing() {
    this.trail = sparkleTrail(this);
    this.input.on('pointerdown', (pointer) => this.startStroke(pointer));
    this.input.on('pointermove', (pointer) => this.continueStroke(pointer));
    const lift = () => {
      this.drawing = false;
      this.trail?.stop();
      // Keep the drawn path and move the start marker.
      this.guide?.lift();
    };
    this.input.on('pointerup', lift);
    this.input.on('pointerupoutside', lift);
  }

  /* Pointer position relative to the ink texture, or null if far outside. */
  toInk(pointer) {
    const x = pointer.worldX - this.inkOrigin.x;
    const y = pointer.worldY - this.inkOrigin.y;
    const margin = BRUSH_RADIUS;
    if (
      x < -margin ||
      y < -margin ||
      x > this.inkSize.width + margin ||
      y > this.inkSize.height + margin
    ) {
      return null;
    }
    return { x, y };
  }

  startStroke(pointer) {
    if (this.locked) return;
    if (this.guide) {
      // Nothing at all unless the finger lands on the start dot.
      if (!this.guide.begin(pointer.worldX, pointer.worldY)) return;
      this.drawing = true;
      this.trail?.setPosition(pointer.worldX, pointer.worldY);
      this.trail?.start();
      this.checkDone();
      return;
    }
    const point = this.toInk(pointer);
    if (!point) return;
    this.drawing = true;
    this.last = point;
    this.dab(point.x, point.y);
    // Sparkles follow the finger while it is inside the letter, and only while it is inside.
    this.trail?.setPosition(pointer.worldX, pointer.worldY);
    this.trail?.start();
  }

  continueStroke(pointer) {
    if (!this.drawing || this.locked) return;
    if (this.guide) {
      // The trail follows the ink.
      if (this.guide.move(pointer.worldX, pointer.worldY)) {
        this.trail?.setPosition(pointer.worldX, pointer.worldY);
        this.trail?.start();
      } else {
        this.trail?.stop();
      }
      this.checkDone();
      return;
    }
    const point = this.toInk(pointer);
    // Outside the letter, so no ink and no sparkles.
    if (!point) {
      this.trail?.stop();
      return;
    }

    // Interpolate between sparse pointer events.
    const from = this.last ?? point;
    const distance = Phaser.Math.Distance.Between(from.x, from.y, point.x, point.y);
    const steps = Math.max(1, Math.ceil(distance / (BRUSH_RADIUS / 2)));
    for (let i = 1; i <= steps; i++) {
      const t = i / steps;
      this.dab(
        Phaser.Math.Linear(from.x, point.x, t),
        Phaser.Math.Linear(from.y, point.y, t)
      );
    }
    this.last = point;
    this.trail?.setPosition(pointer.worldX, pointer.worldY);
    this.trail?.start();
    this.checkDone();
  }

  dab(x, y) {
    // Cover coordinates are supersampled, display coordinates are not.
    const ctx = this.cover.context;
    const cx = x * SUPER;
    const cy = y * SUPER;
    const r = BRUSH_RADIUS * SUPER;

    ctx.save();
    // Eats the cover away, leaving the coloured letter beneath.
    ctx.globalCompositeOperation = 'destination-out';
    const gradient = ctx.createRadialGradient(cx, cy, r * 0.55, cx, cy, r);
    gradient.addColorStop(0, 'rgba(0,0,0,1)');
    gradient.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // Uploading the texture is the expensive part, so it happens once a frame in update() rather than once per pointer sample.
    this.coverDirty = true;
    this.markCells(x, y);
  }

  update() {
    if (this.coverDirty && this.cover) {
      this.cover.refresh();
      this.coverDirty = false;
    }
  }

  markCells(x, y) {
    const minCol = Math.max(0, Math.floor((x - BRUSH_RADIUS) / CELL));
    const maxCol = Math.min(this.cols - 1, Math.floor((x + BRUSH_RADIUS) / CELL));
    const minRow = Math.max(0, Math.floor((y - BRUSH_RADIUS) / CELL));
    const maxRow = Math.min(this.rows - 1, Math.floor((y + BRUSH_RADIUS) / CELL));

    for (let row = minRow; row <= maxRow; row++) {
      for (let col = minCol; col <= maxCol; col++) {
        const cell = this.grid[row]?.[col];
        if (!cell || !cell.inside || cell.covered) continue;
        const cx = (col + 0.5) * CELL;
        const cy = (row + 0.5) * CELL;
        if (Phaser.Math.Distance.Between(x, y, cx, cy) <= BRUSH_RADIUS) {
          cell.covered = true;
          this.coveredCount++;
        }
      }
    }
  }

  get coverage() {
    if (this.guide) return this.guide.progress;
    return this.insideCount ? this.coveredCount / this.insideCount : 0;
  }

  drawProgress(fraction) {
    const w = 460;
    const x = PLAY.centerX - w / 2;
    const y = DESIGN.height - 58;
    this.progressBar.clear();
    this.progressBar.fillStyle(0x000000, 0.08);
    this.progressBar.fillRoundedRect(x, y, w, 18, 9);
    if (fraction > 0) {
      this.progressBar.fillStyle(COLORS.correct, 1);
      // Guided mode is finished when every stroke is written.
      const full = this.guide ? fraction : Math.min(1, fraction / DONE_AT);
      this.progressBar.fillRoundedRect(x, y, Math.max(18, w * full), 18, 9);
    }
  }

  checkDone() {
    this.drawProgress(this.coverage);
    // Guided mode calls finishLetter() itself.
    if (this.guide) return;
    if (this.locked || this.coverage < DONE_AT) return;
    this.finishLetter();
  }

  finishLetter() {
    if (this.locked) return;
    this.locked = true;
    this.drawing = false;
    this.trail?.stop();
    finished();
    this.drawProgress(1);
    confetti(this, PLAY.centerX, 300, { count: 30, spread: 320 });
    // The sparkles burst out of the letter itself rather than from the middle of the screen.
    sparkleBurst(this, PLAY.centerX, 360, { count: 44, speed: 420 });
    // Finishing a letter is a whole activity completed.
    wellDone(this, this.stage, { duration: 2400 });

    // Clear the rest of the cover.
    if (this.cover) {
      this.cover.context.clearRect(0, 0, this.cover.width, this.cover.height);
      this.cover.refresh();
    }
    this.guide?.complete();

    this.time.delayedCall(1600, () => this.nextLetter());
  }

  reset() {
    sfx.tap();
    this.buildLetter();
  }

  nextLetter() {
    sfx.swoosh();
    stopAll();
    this.index = (this.index + 1) % this.sequence.length;
    // The ribbon is set by buildLetter, because which instruction is right depends on whether the next letter has a guide.
    this.buildLetter();
  }
}
