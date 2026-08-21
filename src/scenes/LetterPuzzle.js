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

/**
 * Put the letter back together.
 *
 * ## Why a puzzle teaches a shape that looking at it does not
 *
 * Every other screen here asks a child to *recognise* a letter. This one asks
 * them to build it, and those are different: to place a piece you have to know
 * which part of the letter you are holding and where that part goes. A child
 * who can pick ص out of a line-up may still have no idea that its bowl is on
 * the left and its tooth on the right, and this is the screen where they find
 * out.
 *
 * It is also the only screen where the input is a drag. That is deliberate and
 * it is the reason this exists as well as Trace: tracing is a continuous
 * gesture inside a shape, dragging is picking a thing up and putting it
 * somewhere, and a three-year-old is learning both.
 *
 * ## How the pieces are made
 *
 * The letter is rasterised once — it already is, for drawing — and the texture
 * is cut into vertical strips by adding frames to it. No image is generated and
 * nothing is authored per letter: any letter in the app can be a puzzle,
 * including ones added later.
 *
 * Strips rather than jigsaw tabs. Urdu letters are mostly much wider than they
 * are tall, so a vertical cut gives pieces that are each a recognisable part of
 * the letter — a bowl, a tooth, a tail. A 2×2 grid on ک gives two pieces that
 * are almost entirely empty.
 *
 * ## Not on the shared drag helper, and on purpose
 *
 * `src/lib/dragging.js` is where the other five drag screens get their carrying
 * from. This one is not, because its vocabulary is inverted: everywhere else
 * `homeX`/`homeY` is *where a tile came from* and a refused drop swims back to
 * it, while here it is *where the piece belongs in the letter* and the tray is
 * the temporary place. Renaming to fit would touch every line of the layout for
 * the sake of removing twenty, and this screen also lifts a piece to full size
 * as it is picked up — so what is being dragged is the piece as it will look in
 * the letter rather than a thumbnail of it — which is a difference worth having
 * rather than one to flatten.
 *
 * ## Forgiving on purpose
 *
 * The snap radius is large and a piece dropped anywhere else swims back to the
 * tray rather than sticking where it landed. A three-year-old's drag ends
 * wherever their finger leaves the glass, and a puzzle that demands precision
 * is a puzzle about fingers rather than about letters.
 */

/** Display height of the letter being built. */
const LETTER_HEIGHT = 300;
/** Pieces, by how many letters have been finished. */
const PIECES_BY_ROUND = [2, 3, 3, 4, 4, 5];
/** How close a piece has to be dropped to snap home, in screen pixels. */
const SNAP = 90;
const TRAY_Y = DESIGN.height - 118;
/**
 * How big a piece is while it is waiting in the tray.
 *
 * Pieces are strips of a 300px letter, so at full size two of them fill half
 * the screen and the row runs off the bottom. Shrunk in the tray and grown as
 * they land, which also reads as the piece going home rather than merely
 * arriving.
 */
const TRAY_SCALE = 0.48;
/** The glyph rasteriser supersamples by this much; strips are cut at that size. */
const SUPER = 3;

export default class LetterPuzzle extends Phaser.Scene {
  constructor() {
    super('LetterPuzzle');
    /** @type {string[]} every letter this screen may deal */
    this.sequence = [];
    /** @type {string|null} the one being built */
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
    // Drawn one at a time rather than shuffled once, so a letter he is getting
    // wrong elsewhere comes round here sooner. This screen contributes nothing
    // *to* the record — see the note by rightAnswer below, a misdropped piece
    // is a small hand missing a target — but it can still act on it, and
    // building a letter out of its parts is a good way to look hard at a shape.
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
      // Lifted above its neighbours, so a piece being moved is never behind one
      // that is not.
      // Grows to full size as it is picked up, so what is being dragged is the
      // piece as it will look in the letter rather than a thumbnail of it.
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

  // ----------------------------------------------------------------- build

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
    // Without it the game is "guess the letter", which is a different and much
    // harder one — and one a child cannot check themselves.
    const ghostKey = `puzzle:ghost:${id}:${LETTER_HEIGHT}`;
    // Grey rather than white: the backdrop behind this screen is a pale wall,
    // and a white ghost on it is invisible — which turns the game into "guess
    // the letter from two strips", a much harder one nobody asked for.
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

      // Where this strip belongs, in screen coordinates. Worked out from the
      // frame rather than remembered, so it stays right if the cut changes.
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

      // Laid out in the tray in a shuffled order, so the leftmost piece is not
      // simply the leftmost part of the letter.
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

  // ------------------------------------------------------------------ play

  drop(piece) {
    if (piece.placed || this.locked) {
      piece.setDepth(0).setScale(piece.trayScale);
      return;
    }

    const near =
      Phaser.Math.Distance.Between(piece.x, piece.y, piece.homeX, piece.homeY) < SNAP;
    if (!near) {
      // Back to where it was picked up from. Not left where it fell: a scatter
      // of near-misses over the letter makes the ghost impossible to read.
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
    // Nothing recorded, here or in the miss above, for the reason in Memory:
    // a piece dropped away from its home is a small hand missing a target, not
    // a child failing to know a letter, and the two must not end up in the same
    // record.
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
    // The completed letter takes a bow. It is the thing that was built, so it
    // is the thing that should celebrate.
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
