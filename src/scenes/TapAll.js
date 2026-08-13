import Phaser from 'phaser';
import {
  allLetterGlyphs,
  letterGlyph,
  lettersById,
  shapeFamilySiblings,
} from '../lib/content.js';
import { addGlyph, fitEmAlone } from '../lib/glyph.js';
import { clipKeys, hasClip } from '../lib/audio.js';
import * as sfx from '../lib/sfx.js';
import { finished, rightAnswer } from '../lib/flourish.js';
import { dance } from '../lib/celebrate.js';
import { queueBackdrop } from '../lib/backdrops.js';
import { addStage, wellDone } from '../lib/stage.js';
import { bob, hop, popIn, squash } from '../lib/liveliness.js';
import { sparkleBurst } from '../lib/particles.js';
import { sayLetter } from '../lib/say.js';
import { COLORS, DESIGN, familyColor, makeButton } from '../lib/theme.js';

/**
 * Find every one of them, not just one.
 *
 * ## Why this is a different question
 *
 * Every other screen here puts a handful of choices up and asks which. That can
 * be answered by elimination — three of these are obviously not it — and a
 * child who is guessing well looks exactly like a child who knows. This asks
 * for *all* of them out of a dozen, which cannot be guessed and cannot be
 * eliminated: each letter on the board has to be looked at and judged on its
 * own.
 *
 * It is also the first screen with no single right answer and no way to be
 * wrong once and be done, which makes it the closest thing here to reading —
 * scanning a page for a shape you know.
 *
 * ## What is on the board
 *
 * The target several times over, and distractors drawn first from its own
 * shape family. ب ت ث پ differ only in dots; a board of those is the exercise,
 * and a board of letters from the far end of the alphabet would be a spotting
 * game rather than a reading one.
 *
 * ## No fail state, again
 *
 * A wrong tap wobbles and dims that tile and leaves everything else alone. The
 * ones already found stay found. There is no timer, no lives and no score — a
 * three-year-old will tap every tile on the board to see what happens, and that
 * is exploration rather than cheating, so it costs nothing but does not finish
 * the round either.
 */

/** Tiles on the board, and how many of them are the target, by round. */
const ROUNDS = [
  { tiles: 6, wanted: 2 },
  { tiles: 8, wanted: 3 },
  { tiles: 10, wanted: 3 },
  { tiles: 12, wanted: 4 },
  { tiles: 12, wanted: 5 },
];

/** The board's area: clear of the ribbon above and the spider at the left. */
const BOARD = { left: 300, right: DESIGN.width - 50, top: 190, bottom: DESIGN.height - 40 };

export default class TapAll extends Phaser.Scene {
  constructor() {
    super('TapAll');
    /** @type {string[]} */
    this.pool = [];
    this.round = 0;
    /** @type {string|null} */
    this.target = null;
    /** @type {Phaser.GameObjects.Container[]} */
    this.tiles = [];
    this.found = 0;
    this.wanted = 0;
    this.locked = false;
  }

  preload() {
    queueBackdrop(this);
  }

  create() {
    this.pool = [...lettersById.keys()].filter((id) => letterGlyph(id));
    this.round = 0;

    this.stage = addStage(this, {
      instruction: 'tap-all',
      roman: 'Tap every one',
    });
    this.banner = this.stage.banner;
    this.mascot = this.stage.mascot;

    // The letter being hunted for, in the corner, always there and always
    // tappable. Taken from the reference apps, which put the target in the same
    // place on every screen: a child who has lost the question needs one place
    // to look for it.
    this.promptLayer = this.add.container(150, 210);
    this.board = this.add.container(0, 0);

    this.newRound();
  }

  // ------------------------------------------------------------------ board

  newRound() {
    this.board.removeAll(true);
    this.promptLayer.removeAll(true);
    this.tiles = [];
    this.found = 0;
    this.locked = false;
    this.banner.setInstruction('tap-all', 'Tap every one');

    const plan = ROUNDS[Math.min(this.round, ROUNDS.length - 1)];
    const pool = this.pool.filter((id) => id !== this.target);
    this.target = Phaser.Utils.Array.GetRandom(pool.length ? pool : this.pool);
    this.wanted = plan.wanted;

    // Its own family first: those differ from the target by a dot or two, which
    // is what makes this a reading exercise rather than a spotting one.
    const siblings = Phaser.Utils.Array.Shuffle(
      shapeFamilySiblings(this.target).filter((id) => letterGlyph(id))
    );
    const rest = Phaser.Utils.Array.Shuffle(
      this.pool.filter((id) => id !== this.target && !siblings.includes(id))
    );
    const others = [...siblings, ...rest].slice(0, plan.tiles - plan.wanted);

    const ids = Phaser.Utils.Array.Shuffle([
      ...Array.from({ length: plan.wanted }, () => this.target),
      ...others,
    ]);

    this.buildPrompt();
    this.layOut(ids);
    this.speak();
    this.mascot?.point();
  }

  buildPrompt() {
    const letter = lettersById.get(this.target);
    const badge = makeButton(this, {
      x: 0,
      y: 0,
      width: 152,
      height: 132,
      color: familyColor(letter.shapeFamily),
      onTap: () => this.speak(),
    });
    const fit = fitEmAlone(allLetterGlyphs('isolated'), 100, 84);
    badge.add(
      addGlyph(
        this,
        0,
        -6,
        `tap-all-prompt:em${Math.round(fit.em)}:${this.target}`,
        letterGlyph(this.target, 'isolated'),
        { em: fit.em, color: COLORS.onColor }
      )
    );
    if (hasClip(clipKeys.letterName(this.target))) {
      badge.add(this.add.text(0, 44, '🔊', { fontSize: '22px' }).setOrigin(0.5));
    }
    this.promptLayer.add(badge);
    // Breathes, so the question does not read as a label that has been left on
    // the screen.
    bob(this, badge, { distance: 4, duration: 2200 });
  }

  /**
   * Lays the tiles out on a grid that fills the board.
   *
   * A grid rather than a scatter: overlapping tiles are hard for a small finger
   * to choose between, and "did I already tap that one" is a different puzzle
   * from the one being set. Each tile is nudged a few pixels off its cell so
   * the board still reads as things laid out rather than as a spreadsheet.
   */
  layOut(ids) {
    const columns = ids.length <= 6 ? 3 : 4;
    const rows = Math.ceil(ids.length / columns);
    const cellW = (BOARD.right - BOARD.left) / columns;
    const cellH = (BOARD.bottom - BOARD.top) / rows;
    const size = Math.min(cellW, cellH) - 16;

    const fit = fitEmAlone(allLetterGlyphs('isolated'), size - 34, size - 34);

    ids.forEach((id, index) => {
      const column = index % columns;
      const row = Math.floor(index / columns);
      // Short last rows are centred, so a board of ten does not look like a
      // board of twelve with two missing.
      const inRow = Math.min(ids.length - row * columns, columns);
      const rowLeft = BOARD.left + ((columns - inRow) * cellW) / 2;
      const x = rowLeft + (column % inRow) * cellW + cellW / 2;
      const y = BOARD.top + row * cellH + cellH / 2;

      const tile = makeButton(this, {
        x: x + Phaser.Math.Between(-5, 5),
        y: y + Phaser.Math.Between(-5, 5),
        width: size,
        height: size,
        color: COLORS.panelLight,
        onTap: () => this.tap(tile),
      });
      tile.setAngle(Phaser.Math.Between(-3, 3));
      tile.letterId = id;
      tile.done = false;
      tile.add(
        addGlyph(
          this,
          0,
          0,
          `tap-all:em${Math.round(fit.em)}:${id}`,
          letterGlyph(id, 'isolated'),
          { em: fit.em, color: COLORS.ink }
        )
      );
      tile.on('pointerdown', () => squash(this, tile));

      this.tiles.push(tile);
      this.board.add(tile);
      popIn(this, tile, { delay: index * 55, duration: 300 });
      this.time.delayedCall(index * 55 + 30, () => sfx.boing());
    });
  }

  // ------------------------------------------------------------------- play

  speak() {
    sayLetter(this.target, { word: false });
  }

  tap(tile) {
    if (this.locked || tile.done) return;

    if (tile.letterId !== this.target) {
      sfx.nudge();
      this.mascot?.wonder();
      // Dimmed and set aside rather than removed. Removing it would shrink the
      // board towards the answer, which turns "find them all" into "keep
      // tapping until the board is empty".
      this.tweens.add({
        targets: tile,
        x: tile.x + 8,
        duration: 60,
        yoyo: true,
        repeat: 2,
        ease: 'Sine.easeInOut',
      });
      this.tweens.add({ targets: tile, alpha: 0.5, duration: 200 });
      return;
    }

    tile.done = true;
    tile.disableInteractive();
    this.found++;
    rightAnswer();
    sfx.sparkle();
    sparkleBurst(this, tile.x, tile.y, { count: 18, tint: [COLORS.correct, 0xffffff] });
    hop(this, tile, { height: 14 });
    dance(this, tile);

    // A green frame, so a found one is visibly finished rather than merely
    // tapped — which matters here, because the board stays up.
    const mark = this.add.graphics();
    mark.lineStyle(6, COLORS.correct, 1);
    const half = tile.width ? tile.width / 2 : 60;
    mark.strokeRoundedRect(-half, -half, half * 2, half * 2, 18);
    tile.add(mark);

    if (this.found < this.wanted) return;

    // All of them found. The board is complete, so this is a finished activity
    // rather than one right answer, and gets the big celebration.
    this.locked = true;
    finished();
    sayLetter(this.target);
    this.time.delayedCall(700, () => {
      wellDone(this, this.stage, { duration: 2400 });
      this.round++;
      this.time.delayedCall(2200, () => this.newRound());
    });
  }
}
