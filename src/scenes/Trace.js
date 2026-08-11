import Phaser from 'phaser';
import { letterGlyph, lettersById, sequenceFor, uiGlyph } from '../lib/content.js';
import { addGlyph, glyphTexture, glyphWidth } from '../lib/glyph.js';
import { clipKeys, hasClip, play, playSequence, stopAll } from '../lib/audio.js';
import * as sfx from '../lib/sfx.js';
import { COLORS, DESIGN, familyColor, label, makeButton } from '../lib/theme.js';

/**
 * Colour the letter in with a finger.
 *
 * ## Why there is no stroke-order data
 *
 * The obvious way to build tracing is to author a guide path per letter — start
 * dot, direction, stroke order — and score how closely the finger follows it.
 * That needs 38 letters of hand-authored paths before a single one is playable,
 * and it scores a three-year-old on something they cannot yet do. Stroke order
 * matters when a child starts writing properly; at three the job is fine-motor
 * control and learning what the shape *is*.
 *
 * So the target here is the letter's own outline, which already exists for every
 * letter and needs no authoring at all: ink lands only inside the glyph, and the
 * round is won by covering enough of it. A child scribbles, the letter fills in,
 * and the shape they have filled is the shape of the letter.
 *
 * Stroke guides can be layered on later without changing any of this — they
 * would add ordering to a game that already works.
 *
 * ## How coverage is measured
 *
 * The glyph is rasterised once (it already is, for drawing), and a grid is laid
 * over it. Cells whose centre is inside the ink are the ones that count; the
 * finger marks cells as it passes. Coverage is marked-inside over total-inside,
 * so a thin letter like ا is not unfairly harder than a fat one like ص — both
 * need the same *fraction* of themselves filled.
 */

/**
 * The glyph rasteriser supersamples by this much, and the reveal layer is kept
 * at that resolution so a texture can be drawn into it one-to-one.
 */
const SUPER = 3;

/** Display height of the letter being traced. */
const GLYPH_HEIGHT = 400;
/** Grid cell size in display pixels. Small enough to be fair, big enough to be fast. */
const CELL = 13;
/** Fraction of the letter that counts as done. Not 100%: corners are unreachable. */
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

  create() {
    this.cameras.main.setBackgroundColor(COLORS.bg);
    this.sequence = sequenceFor('alphabetical').filter((id) => letterGlyph(id));
    this.index = 0;

    makeButton(this, {
      x: 72,
      y: 56,
      width: 96,
      height: 68,
      color: COLORS.panel,
      onTap: () => {
        sfx.swoosh();
        this.scene.start('Home');
      },
    }).add(
      this.add.text(0, 0, '⌂', { fontSize: '34px', color: COLORS.ink }).setOrigin(0.5)
    );

    const title = uiGlyph('trace');
    if (title) {
      addGlyph(this, DESIGN.width / 2, 52, 'ui:trace:44:ink', title, {
        height: 44,
        color: COLORS.ink,
      });
    }

    makeButton(this, {
      x: DESIGN.width - 250,
      y: 56,
      width: 150,
      height: 64,
      color: COLORS.panel,
      onTap: () => this.reset(),
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
    this.progressBar = this.add.graphics();

    this.buildLetter();
    this.attachDrawing();

    this.events.once('shutdown', stopAll);
  }

  // ------------------------------------------------------------------ setup

  get letterId() {
    return this.sequence[this.index];
  }

  buildLetter() {
    this.layer.removeAll(true);
    this.locked = false;
    this.drawing = false;

    const id = this.letterId;
    const glyph = letterGlyph(id, 'isolated');
    const letter = lettersById.get(id);
    const tint = familyColor(letter.shapeFamily);
    const tintCss = '#' + tint.toString(16).padStart(6, '0');

    const width = glyphWidth(glyph, GLYPH_HEIGHT);
    const centreX = DESIGN.width / 2;
    const centreY = 380;
    const left = centreX - width / 2;
    const top = centreY - GLYPH_HEIGHT / 2;

    // Three layers, bottom to top:
    //
    //   1. the letter, already filled in colour
    //   2. a cover in the pale "not done yet" shade, which the finger erases
    //   3. the outline, so the letter's edge stays visible throughout
    //
    // Erasing the cover rather than painting ink is what keeps the colouring
    // inside the lines: the coloured letter only exists within the glyph, so a
    // stroke that wanders outside reveals nothing, and no mask is needed —
    // which matters, because Phaser 4 dropped bitmap masks.
    //
    // The cover is a CanvasTexture painted through its own 2D context rather
    // than a RenderTexture. RenderTexture and DynamicTexture both render
    // nothing at all in this build — even a plain fill() — whereas canvas
    // textures are what every glyph in the app already goes through.
    const filledKey = `trace:filled:${id}:${GLYPH_HEIGHT}`;
    glyphTexture(this, filledKey, glyph, { height: GLYPH_HEIGHT, color: tintCss });
    this.layer.add(this.add.image(centreX, centreY, filledKey).setScale(1 / SUPER));

    // Opaque, and only a shade off the background: it has to hide the coloured
    // letter completely or the round starts already finished, while still
    // showing the letter's body as something to fill rather than a blank.
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

    // Read from the opaque fill, not the pale cover: the cover's alpha is a
    // tenth, which no sane ink threshold would accept.
    this.buildGrid(filledKey, width);
    this.drawProgress(0);

    this.layer.add(
      label(this, centreX, centreY + GLYPH_HEIGHT / 2 + 46, letter.roman, {
        size: 26,
        color: COLORS.ink,
      })
    );

    if (hasClip(clipKeys.letterName(id))) {
      playSequence([clipKeys.letterName(id), clipKeys.letterSound(id)]);
    }
  }

  /**
   * Reads the rasterised letter once and records which cells are ink.
   *
   * Done from the texture rather than from the path so that whatever the
   * renderer actually drew is what gets scored — including the thin joins in
   * Nastaliq, which a geometric test over the outline would get wrong.
   */
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

  // --------------------------------------------------------------- drawing

  attachDrawing() {
    this.input.on('pointerdown', (pointer) => this.startStroke(pointer));
    this.input.on('pointermove', (pointer) => this.continueStroke(pointer));
    this.input.on('pointerup', () => (this.drawing = false));
    this.input.on('pointerupoutside', () => (this.drawing = false));
  }

  /** Pointer position relative to the ink texture, or null if far outside. */
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
    const point = this.toInk(pointer);
    if (!point) return;
    this.drawing = true;
    this.last = point;
    this.dab(point.x, point.y);
  }

  continueStroke(pointer) {
    if (!this.drawing || this.locked) return;
    const point = this.toInk(pointer);
    if (!point) return;

    // Interpolate: a fast finger produces pointer events tens of pixels apart,
    // and dabbing only at those would leave a dotted line and under-count what
    // the child actually covered.
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
    this.checkDone();
  }

  dab(x, y) {
    // Cover coordinates are supersampled, display coordinates are not.
    const ctx = this.cover.context;
    const cx = x * SUPER;
    const cy = y * SUPER;
    const r = BRUSH_RADIUS * SUPER;

    ctx.save();
    // Eats the cover away, leaving the coloured letter beneath. The soft edge
    // means the letter fills in smoothly rather than in visible discs.
    ctx.globalCompositeOperation = 'destination-out';
    const gradient = ctx.createRadialGradient(cx, cy, r * 0.55, cx, cy, r);
    gradient.addColorStop(0, 'rgba(0,0,0,1)');
    gradient.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // Uploading the texture is the expensive part, so it happens once a frame
    // in update() rather than once per pointer sample.
    this.coverDirty = true;
    this.markCells(x, y);
  }

  update() {
    if (this.coverDirty) {
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
    return this.insideCount ? this.coveredCount / this.insideCount : 0;
  }

  drawProgress(fraction) {
    const w = 460;
    const x = DESIGN.width / 2 - w / 2;
    const y = DESIGN.height - 58;
    this.progressBar.clear();
    this.progressBar.fillStyle(0x000000, 0.08);
    this.progressBar.fillRoundedRect(x, y, w, 18, 9);
    if (fraction > 0) {
      this.progressBar.fillStyle(COLORS.correct, 1);
      this.progressBar.fillRoundedRect(x, y, Math.max(18, w * Math.min(1, fraction / DONE_AT)), 18, 9);
    }
  }

  checkDone() {
    this.drawProgress(this.coverage);
    if (this.locked || this.coverage < DONE_AT) return;

    this.locked = true;
    this.drawing = false;
    sfx.correct();
    this.drawProgress(1);

    // Clear the rest of the cover, so the reward is seeing the letter complete
    // rather than the patchy version they happened to stop at.
    this.cover.context.clearRect(0, 0, this.cover.width, this.cover.height);
    this.cover.refresh();

    this.time.delayedCall(900, () => this.nextLetter());
  }

  // ------------------------------------------------------------- navigation

  reset() {
    sfx.tap();
    this.buildLetter();
  }

  nextLetter() {
    sfx.swoosh();
    stopAll();
    this.index = (this.index + 1) % this.sequence.length;
    this.buildLetter();
  }
}
