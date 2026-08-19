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
import { milestone, rightAnswer, wrongAnswer } from '../lib/flourish.js';
import { queueBackdrop } from '../lib/backdrops.js';
import { addStage, wellDone } from '../lib/stage.js';
import { bob, squash } from '../lib/liveliness.js';
import { popPuff, sparkleBurst } from '../lib/particles.js';
import { sayLetter } from '../lib/say.js';
import { COLORS, RAIL_EDGE, familyColor, makeButton } from '../lib/theme.js';

/**
 * Tap the letter while it is up.
 *
 * ## Recognising fast is a different skill from recognising
 *
 * Every other screen here lets a child stare at the answer for as long as they
 * like, and that is right for learning a shape. It is not how reading works:
 * by the time somebody is reading, letters are recognised in the time it takes
 * the eye to pass over them. This is the one screen that asks for that, and it
 * is the last thing a child should meet rather than the first.
 *
 * ## How it stays kind about it
 *
 * Every rule here exists to stop it becoming a reflex test a three-year-old
 * loses:
 *
 *   - **Nothing is ever missed.** If the target pops up and goes down again
 *     untouched, nothing happens — no penalty, no counter, no sad noise. It
 *     simply comes back.
 *   - **The target is always up.** At least one hole is showing the right
 *     letter at any moment, so there is never a stretch with nothing to do.
 *   - **It gets slower, never faster, when it is going badly.** The time a
 *     letter stays up grows on a wrong tap and shrinks only on a streak.
 *
 * A wrong tap costs the streak and nothing else, which is the same rule every
 * other screen here follows.
 */

/** How long a letter stays up, by streak. Never shorter than a slow look. */
const UP_MS = [3200, 2900, 2600, 2400, 2200];
/** Added back on a wrong tap, so a struggling child gets more time, not less. */
const MERCY_MS = 500;
/** How often a hole is considered for popping, and how many may be up at once. */
const TICK_MS = 750;
const MAX_UP = 3;

/**
 * Where the holes are.
 *
 * All of them on the grass. An earlier set had the back row at y=300, which is
 * sky on this backdrop — three holes hanging in the air above the field.
 */
const HOLES = [
  { x: 470, y: 505 },
  { x: 700, y: 478 },
  { x: 930, y: 505 },
  { x: 470, y: 648 },
  { x: 700, y: 672 },
  { x: 930, y: 648 },
];
const LETTER_BOX = 108;

export default class Whack extends Phaser.Scene {
  constructor() {
    super('Whack');
    /** @type {string[]} */
    this.pool = [];
    this.streak = 0;
    /** @type {string|null} */
    this.target = null;
    /** @type {*[]} */
    this.holes = [];
    this.mercy = 0;
    this.locked = false;
  }

  preload() {
    queueBackdrop(this);
  }

  create() {
    this.pool = [...lettersById.keys()].filter((id) => letterGlyph(id));
    this.streak = 0;
    this.mercy = 0;
    this.holes = [];

    this.stage = addStage(this, {
      instruction: 'tap-quick',
      roman: 'Tap it quickly',
    });
    this.banner = this.stage.banner;
    this.rail = this.stage.rail;

    this.fit = fitEmAlone(allLetterGlyphs('isolated'), LETTER_BOX - 24, LETTER_BOX - 30);
    this.promptLayer = this.add.container(RAIL_EDGE + 96, 210);

    this.buildHoles();
    this.newTarget();

    // Everything on this screen is on a timer, so leaving it must stop them —
    // a delayedCall firing into a dead scene is a crash on the menu.
    this.events.once('shutdown', () => {
      this.ticker?.remove();
      this.time.removeAllEvents();
    });
  }

  buildHoles() {
    for (const spot of HOLES) {
      const hole = this.add.container(spot.x, spot.y);
      // The mound the letter comes out of. Drawn once and left alone; only the
      // letter moves.
      const mound = this.add.graphics();
      mound.fillStyle(0x8a6a44, 1);
      mound.fillEllipse(0, 34, 172, 54);
      mound.fillStyle(0x4a3520, 1);
      mound.fillEllipse(0, 28, 138, 40);
      hole.add(mound);

      // The letter, hidden below the rim until it pops. Its own container so
      // the mound can draw over the bottom of it.
      const tile = makeButton(this, {
        x: 0,
        y: 0,
        width: LETTER_BOX,
        height: LETTER_BOX,
        color: COLORS.panelLight,
        onTap: () => this.tap(hole),
      });
      tile.setVisible(false);
      hole.add(tile);
      // The mound again, over the letter, so it rises out of the hole rather
      // than appearing in front of it.
      const lip = this.add.graphics();
      lip.fillStyle(0x8a6a44, 1);
      lip.fillEllipse(0, 40, 172, 44);
      hole.add(lip);

      hole.tile = tile;
      hole.letterId = null;
      hole.up = false;
      this.holes.push(hole);
    }
  }

  // ----------------------------------------------------------------- rounds

  newTarget() {
    const pool = this.pool.filter((id) => id !== this.target);
    this.target = Phaser.Utils.Array.GetRandom(pool.length ? pool : this.pool);
    this.buildPrompt();
    this.updateStreak();
    sayLetter(this.target, { word: false });

    for (const hole of this.holes) this.hide(hole, true);
    // One straight away so there is never an empty screen.
    this.popUp(Phaser.Utils.Array.GetRandom(this.holes), this.target);

    // A single heartbeat rather than a timer per hole. Six independent timers
    // all fired within the first second and put every letter up at once, which
    // is not a game of spotting one — it is a wall.
    this.ticker?.remove();
    this.ticker = this.time.addEvent({
      delay: TICK_MS,
      loop: true,
      callback: () => this.tick(),
    });
  }

  tick() {
    if (this.locked || !this.scene.isActive()) return;
    const up = this.holes.filter((h) => h.up);
    if (up.length >= MAX_UP) return;
    const empty = this.holes.filter((h) => !h.up);
    if (!empty.length) return;
    this.maybePop(Phaser.Utils.Array.GetRandom(empty));
  }

  buildPrompt() {
    this.promptLayer.removeAll(true);
    const letter = lettersById.get(this.target);
    const badge = makeButton(this, {
      x: 0,
      y: 0,
      width: 154,
      height: 132,
      color: familyColor(letter.shapeFamily),
      onTap: () => sayLetter(this.target, { word: false }),
    });
    const fit = fitEmAlone(allLetterGlyphs('isolated'), 100, 84);
    badge.add(
      addGlyph(
        this,
        0,
        -6,
        `whack-prompt:em${Math.round(fit.em)}:${this.target}`,
        letterGlyph(this.target, 'isolated'),
        { em: fit.em, color: COLORS.onColor }
      )
    );
    if (hasClip(clipKeys.letterName(this.target))) {
      badge.add(this.add.text(0, 44, '🔊', { fontSize: '22px' }).setOrigin(0.5));
    }
    this.promptLayer.add(badge);
    bob(this, badge, { distance: 4, duration: 2200 });
  }

  updateStreak() {
  }

  // ------------------------------------------------------------------ holes

  /** How long a letter stays up: faster with a streak, slower after a miss. */
  upTime() {
    return UP_MS[Math.min(this.streak, UP_MS.length - 1)] + this.mercy;
  }

  /**
   * Pops a hole with something, keeping at least one target on screen.
   *
   * The guarantee matters more than the variety: a child who is looking for ب
   * and sees five holes of other letters has nothing to do but wait, and
   * waiting is exactly what this screen is bad at asking for.
   */
  maybePop(hole) {
    if (this.locked || !this.scene.isActive() || hole.up) return;
    const targetUp = this.holes.some((h) => h.up && h.letterId === this.target);
    if (!targetUp) return this.popUp(hole, this.target);

    const siblings = shapeFamilySiblings(this.target).filter((id) => letterGlyph(id));
    const others = siblings.length ? siblings : this.pool;
    // A quarter of the time it is the target again, so two can be up at once
    // and the screen does not become "find the one that is not repeated".
    const id =
      Math.random() < 0.25
        ? this.target
        : Phaser.Utils.Array.GetRandom(others.filter((o) => o !== this.target));
    this.popUp(hole, id ?? this.target);
  }

  popUp(hole, letterId) {
    if (hole.up || this.locked) return;
    hole.up = true;
    hole.letterId = letterId;

    const tile = hole.tile;
    // Only the letter is replaced. `removeAll` would take the button's own
    // card and shadow with it — makeButton draws those as children — and the
    // letters then popped out of the holes with nothing behind them.
    tile.glyph?.destroy();
    tile.glyph = addGlyph(
      this,
      0,
      0,
      `whack:em${Math.round(this.fit.em)}:${letterId}`,
      letterGlyph(letterId, 'isolated'),
      { em: this.fit.em, color: COLORS.ink }
    );
    tile.add(tile.glyph);
    tile.setVisible(true).setY(46).setAlpha(1);
    tile.setScale(1);

    sfx.boing();
    this.tweens.add({
      targets: tile,
      y: -54,
      duration: 260,
      ease: 'Back.easeOut',
    });

    hole.timer = this.time.delayedCall(this.upTime(), () => this.hide(hole));
  }

  hide(hole, instant = false) {
    hole.timer?.remove();
    hole.timer = null;
    if (!hole.up) return;
    hole.up = false;
    hole.letterId = null;
    if (instant) {
      hole.tile.setVisible(false);
      return;
    }
    this.tweens.add({
      targets: hole.tile,
      y: 46,
      duration: 220,
      ease: 'Quad.easeIn',
      // Nothing else happens. A target that went down untouched is not a
      // failure and must not be reported as one.
      onComplete: () => hole.tile.setVisible(false),
    });
  }

  // ------------------------------------------------------------------- play

  tap(hole) {
    if (this.locked || !hole.up) return;
    squash(this, hole.tile);

    if (hole.letterId !== this.target) {
      wrongAnswer();
      this.rail?.wonder();
      this.streak = 0;
      // More time, not less. The one thing that must not happen here is a
      // child getting it wrong and the game speeding up in response.
      this.mercy = Math.min(this.mercy + MERCY_MS, MERCY_MS * 4);
      this.updateStreak();
      this.hide(hole);
      return;
    }

    rightAnswer();
    sfx.pop();
    this.streak++;
    this.mercy = Math.max(0, this.mercy - MERCY_MS);
    this.updateStreak();
    popPuff(this, hole.x, hole.y - 40, familyColor(lettersById.get(this.target).shapeFamily));
    sparkleBurst(this, hole.x, hole.y - 40, { count: 24 });
    this.rail?.cheer();
    this.hide(hole);

    if (this.streak % 5 === 0) {
      milestone();
      wellDone(this, this.stage);
    }

    // A new letter to look for, after a beat to see the burst.
    this.locked = true;
    this.time.delayedCall(900, () => {
      this.locked = false;
      if (this.scene.isActive()) this.newTarget();
    });
  }
}
