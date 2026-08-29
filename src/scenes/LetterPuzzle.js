import Phaser from 'phaser';
import { letterGlyph, lettersById, sequenceFor } from '../lib/content.js';
import { glyphTexture, glyphWidth } from '../lib/glyph.js';
import * as sfx from '../lib/sfx.js';
import { finished, rightAnswer, wrongAnswer } from '../lib/flourish.js';
import { dance } from '../lib/celebrate.js';
import { queueBackdrop } from '../lib/backdrops.js';
import { addStage, wellDone } from '../lib/stage.js';
import { hop } from '../lib/liveliness.js';
import { sparkleBurst } from '../lib/particles.js';
import { sayLetter } from '../lib/say.js';
import { DESIGN, familyColor, label, PLAY } from '../lib/theme.js';
import { pickWeighted } from '../lib/mastery.js';

/* Put the letter back together. */

/* Display height of the letter being built. */
const LETTER_HEIGHT = 300;
/* Pieces, by how many letters have been finished. */
const PIECES_BY_ROUND = [2, 3, 3, 4, 4, 5];
/* How close a piece has to be dropped to snap home, in screen pixels. */
const SNAP = 90;
const TRAY_Y = DESIGN.height - 118;
/* How big a piece is while it is waiting in the tray. */
const TRAY_SCALE = 0.48;
/* The glyph rasteriser supersamples by this much; strips are cut at that size. */
const SUPER = 3;

export default class LetterPuzzle extends Phaser.Scene {
  constructor() {
    super('LetterPuzzle');
    /** @type {string[]} */
    this.sequence = [];
    /** @type {string|null} */
    this.letterId = null;
    this.round = 0;
    /** @type {Phaser.GameObjects.Image[]} */
    this.pieces = [];
    this.placed = 0;
    this.locked = false;
  }

  preload() {
    queueBackdrop(this);
  }

  create() {
    this.sequence = sequenceFor('alphabetical').filter((id) => letterGlyph(id));
    // Drawn one at a time rather than shuffled once, so a letter he is getting wrong elsewhere comes round here sooner.
    this.letterId = pickWeighted('letter', this.sequence);
    this.round = 0;

    this.stage = addStage(this, {
      hills: false,
      instruction: 'build-letter',
      roman: 'Build the letter',
    });
    this.banner = this.stage.banner;
    this.rail = this.stage.rail;

    this.layer = this.add.container(0, 0);
    this.buildLetter();

    // One drag handler for the scene rather than one per piece.
    this.input.on('drag', (pointer, piece, x, y) => {
      if (piece.placed) return;
      piece.setPosition(x, y);
    });
    this.input.on('dragstart', (pointer, piece) => {
      if (piece.placed) return;
      sfx.tap();
      // Lifted above its neighbours, so a piece being moved is never behind one that is not.
      piece.setDepth(20);
      this.tweens.add({
        targets: piece,
        scaleX: piece.homeScale,
        scaleY: piece.homeScale,
        duration: 140,
      });
    });
    this.input.on('dragend', (pointer, piece) => this.drop(piece));
  }

  buildLetter() {
    this.layer.removeAll(true);
    this.pieces = [];
    this.placed = 0;
    this.locked = false;
    this.banner.setInstruction('build-letter', 'Build the letter');

    const id = this.letterId;
    const glyph = letterGlyph(id, 'isolated');
    const letter = lettersById.get(id);
    const tint = familyColor(letter.shapeFamily);
    const tintCss = '#' + tint.toString(16).padStart(6, '0');

    const width = glyphWidth(glyph, LETTER_HEIGHT);
    const centreX = PLAY.centerX;
    const centreY = 330;

    // The ghost: the whole letter in a pale shade, showing where the pieces go.
    const ghostKey = `puzzle:ghost:${id}:${LETTER_HEIGHT}`;
    // Grey rather than white.
    glyphTexture(this, ghostKey, glyph, { height: LETTER_HEIGHT, color: '#c3c7d4' });
    const ghost = this.add
      .image(centreX, centreY, ghostKey)
      .setScale(1 / SUPER)
      .setAlpha(0.85);
    this.layer.add(ghost);

    // The letter proper, cut into strips.
    const key = `puzzle:filled:${id}:${LETTER_HEIGHT}`;
    glyphTexture(this, key, glyph, { height: LETTER_HEIGHT, color: tintCss });
    const texture = this.textures.get(key);
    const source = texture.getSourceImage();

    const count = Math.min(
      PIECES_BY_ROUND[Math.min(this.round, PIECES_BY_ROUND.length - 1)],
      // Never so many that a strip is thinner than a finger.
      Math.max(2, Math.floor(width / 60))
    );
    const stripWidth = Math.floor(source.width / count);

    const order = Phaser.Utils.Array.Shuffle(
      Array.from({ length: count }, (_, i) => i)
    );
    const trayStep = Math.min(210, (DESIGN.width - 380) / count);
    const trayStart = PLAY.centerX + ((count - 1) * trayStep) / 2;

    for (let i = 0; i < count; i++) {
      const frame = `strip${i}`;
      if (!texture.has(frame)) {
        // The last strip takes the remainder, so no column of pixels is lost.
        const w = i === count - 1 ? source.width - stripWidth * i : stripWidth;
        texture.add(frame, 0, stripWidth * i, 0, w, source.height);
      }
      const info = texture.get(frame);

      // Where this strip belongs, in screen coordinates.
      const homeX =
        centreX - (source.width / SUPER) / 2 + (info.cutX + info.width / 2) / SUPER;
      const homeY = centreY;

      const piece = this.add.image(0, 0, key, frame);
      piece.homeX = homeX;
      piece.homeY = homeY;
      piece.homeScale = 1 / SUPER;
      piece.trayScale = (1 / SUPER) * TRAY_SCALE;
      piece.setScale(piece.trayScale);
      piece.placed = false;
      piece.slot = i;

      // Laid out in the tray in a shuffled order, so the leftmost piece is not simply the leftmost part of the letter.
      const at = order.indexOf(i);
      piece.setPosition(trayStart - at * trayStep, TRAY_Y);
      piece.startX = piece.x;
      piece.setInteractive({ draggable: true, useHandCursor: true });
      this.input.setDraggable(piece);

      this.layer.add(piece);
      this.pieces.push(piece);
    }

    this.layer.add(
      label(this, centreX, centreY + LETTER_HEIGHT / 2 + 30, letter.roman, { size: 20 })
    );

    sayLetter(id, { word: false });
  }

  drop(piece) {
    if (piece.placed || this.locked) {
      piece.setDepth(0).setScale(piece.trayScale);
      return;
    }

    const near =
      Phaser.Math.Distance.Between(piece.x, piece.y, piece.homeX, piece.homeY) < SNAP;
    if (!near) {
      // Back to where it was picked up from.
      wrongAnswer();
      this.rail?.wonder();
      this.tweens.add({
        targets: piece,
        x: piece.startX,
        y: TRAY_Y,
        scaleX: piece.trayScale,
        scaleY: piece.trayScale,
        duration: 260,
        ease: 'Back.easeOut',
      });
      piece.setDepth(0);
      return;
    }

    piece.placed = true;
    piece.disableInteractive();
    piece.setDepth(1);
    this.placed++;
    // A piece dropped away from its home should not count as an answer.
    rightAnswer();
    sfx.sparkle();

    this.tweens.add({
      targets: piece,
      x: piece.homeX,
      y: piece.homeY,
      scaleX: piece.homeScale,
      scaleY: piece.homeScale,
      duration: 180,
      ease: 'Quad.easeOut',
      onComplete: () => sparkleBurst(this, piece.x, piece.y, { count: 14 }),
    });

    if (this.placed < this.pieces.length) return;
    this.finish();
  }

  finish() {
    this.locked = true;
    finished();
    sayLetter(this.letterId);
    // The completed letter takes a bow.
    for (const piece of this.pieces) {
      hop(this, piece, { height: 18 });
      dance(this, piece);
    }
    this.time.delayedCall(700, () => {
      wellDone(this, this.stage, { duration: 2400 });
      this.round++;
      this.letterId = pickWeighted('letter', this.sequence, { avoid: [this.letterId] });
      this.time.delayedCall(2200, () => this.buildLetter());
    });
  }
}
