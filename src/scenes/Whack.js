import Phaser from 'phaser';
import { activeLetters, allLetterGlyphs, letterGlyph, lettersById, shapeFamilySiblings } from '../lib/content.js';
import { addGlyph, fitEmAlone } from '../lib/glyph.js';
import { clipKeys, hasClip } from '../lib/audio.js';
import * as sfx from '../lib/sfx.js';
import { milestone, rightAnswer, wrongAnswer } from '../lib/flourish.js';
import { queueBackdrop } from '../lib/backdrops.js';
import { addProp, queueProps } from '../lib/prop-art.js';
import { addStage, wellDone } from '../lib/stage.js';
import { bob, squash } from '../lib/liveliness.js';
import { popPuff, sparkleBurst } from '../lib/particles.js';
import { sayLetter } from '../lib/say.js';
import { COLORS, RAIL_EDGE, familyColor, makeButton, PLAY } from '../lib/theme.js';
import { pickWeighted } from '../lib/mastery.js';

/* Tap the letter while it is up. */

/* How long a letter stays up, by streak. */
const UP_MS = [3200, 2900, 2600, 2400, 2200];
/* Added back on a wrong tap, so a struggling child gets more time, not less. */
const MERCY_MS = 500;
/* How often a hole is considered for popping, and how many may be up at once. */
const TICK_MS = 750;
const MAX_UP = 3;

/* Where the holes are. */
const SPREAD = 230;
const HOLES = [
  { x: PLAY.centerX - SPREAD, y: 505 },
  { x: PLAY.centerX, y: 478 },
  { x: PLAY.centerX + SPREAD, y: 505 },
  { x: PLAY.centerX - SPREAD, y: 586 },
  { x: PLAY.centerX, y: 610 },
  { x: PLAY.centerX + SPREAD, y: 586 },
];
const LETTER_BOX = 108;

/* The pictures this screen loads, and how big the mound is drawn. */
const PROPS = ['whack-mound', 'whack-mound-front'];
/* Wider than the ellipses it replaces (172) but well inside `SPREAD`. */
const MOUND = { width: 220, y: 34 };
/* Where the letter sits, down inside the mound and up out of its hole. */
const LETTER_Y = { up: -42, down: 54 };

/* What a hole looks like with no picture: the two flat ellipses this screen had for as long as it existed. */
function drawnMound(scene, holeColor) {
  const mound = scene.add.graphics();
  mound.fillStyle(0x8a6a44, 1);
  mound.fillEllipse(0, 34, 172, 54);
  mound.fillStyle(holeColor, 1);
  mound.fillEllipse(0, 28, 138, 40);
  return mound;
}

function drawnLip(scene) {
  const lip = scene.add.graphics();
  lip.fillStyle(0x8a6a44, 1);
  lip.fillEllipse(0, 40, 172, 44);
  return lip;
}

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
    queueProps(this, PROPS);
  }

  create() {
    this.pool = activeLetters()
      .map((letter) => letter.id)
      .filter((id) => letterGlyph(id));
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

    // Everything on this screen is on a timer.
    this.events.once('shutdown', () => {
      this.ticker?.remove();
      this.time.removeAllEvents();
    });
  }

  buildHoles() {
    for (const spot of HOLES) {
      const hole = this.add.container(spot.x, spot.y);
      // The mound the letter comes out of, in two pieces: this one behind the letter, and the lip below over it.
      const mound =
        addProp(this, 0, MOUND.y, 'whack-mound', { width: MOUND.width }) ??
        drawnMound(this, 0x4a3520);
      hole.add(mound);

      // The letter, hidden below the rim until it pops.
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
      // The mound again, over the letter, so it rises out of the hole rather than appearing in front of it.
      const lip =
        addProp(this, 0, MOUND.y, 'whack-mound-front', { width: MOUND.width }) ??
        drawnLip(this);
      hole.add(lip);

      hole.tile = tile;
      hole.letterId = null;
      hole.up = false;
      this.holes.push(hole);
    }
  }

  newTarget() {
    this.target = pickWeighted('letter', this.pool, { avoid: [this.target] });
    this.buildPrompt();
    this.updateStreak();
    sayLetter(this.target, { word: false });

    for (const hole of this.holes) this.hide(hole, true);
    // One straight away so there is never an empty screen.
    this.popUp(Phaser.Utils.Array.GetRandom(this.holes), this.target);

    // A single heartbeat rather than a timer per hole.
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

  /* How long a letter stays up: faster with a streak, slower after a miss. */
  upTime() {
    return UP_MS[Math.min(this.streak, UP_MS.length - 1)] + this.mercy;
  }

  /* Pops a hole with something, keeping at least one target on screen. */
  maybePop(hole) {
    if (this.locked || !this.scene.isActive() || hole.up) return;
    const targetUp = this.holes.some((h) => h.up && h.letterId === this.target);
    if (!targetUp) return this.popUp(hole, this.target);

    const siblings = shapeFamilySiblings(this.target).filter((id) => letterGlyph(id));
    const others = siblings.length ? siblings : this.pool;
    // A quarter of the time it is the target again.
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
    // Only the letter is replaced.
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
    tile.setVisible(true).setY(LETTER_Y.down).setAlpha(1);
    tile.setScale(1);

    sfx.boing();
    this.tweens.add({
      targets: tile,
      y: LETTER_Y.up,
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
      y: LETTER_Y.down,
      duration: 220,
      ease: 'Quad.easeIn',
      // Nothing else happens.
      onComplete: () => hole.tile.setVisible(false),
    });
  }

  tap(hole) {
    if (this.locked || !hole.up) return;
    squash(this, hole.tile);

    if (hole.letterId !== this.target) {
      wrongAnswer({ subject: { kind: 'letter', id: this.target } });
      this.rail?.wonder();
      this.streak = 0;
      // More time, not less.
      this.mercy = Math.min(this.mercy + MERCY_MS, MERCY_MS * 4);
      this.updateStreak();
      this.hide(hole);
      return;
    }

    rightAnswer({ kind: 'letter', id: this.target });
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
