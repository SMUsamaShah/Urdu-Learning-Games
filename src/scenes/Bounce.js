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
import { bob } from '../lib/liveliness.js';
import { popPuff, sparkleBurst } from '../lib/particles.js';
import { sayLetter } from '../lib/say.js';
import { COLORS, DESIGN, RAIL_EDGE, familyColor, makeButton } from '../lib/theme.js';

/**
 * Catch the letter on the way up.
 *
 * The third and last screen where the answer moves, and each of the three moves
 * differently on purpose — a child who can only recognise a letter that is
 * holding still has not finished learning it:
 *
 *   - **Balloons** drift upwards and leave the top. Slow and one-way.
 *   - **Fishing** crosses sideways and comes round again. Steady.
 *   - **This** bounces: every letter is briefly still at the top of its arc and
 *     fastest in the middle, so the moment to tap is a moment rather than a
 *     window. It is the closest thing here to timing, and it is the gentlest
 *     way to ask for it — nothing is ever missed, because a letter that comes
 *     down simply goes back up.
 *
 * The arcs are deliberately out of step, so the screen never settles into a
 * rhythm a child could tap along with without looking.
 */

/** Time for one full bounce, by streak. Slower is easier. */
const BOUNCE_MS = [2600, 2400, 2200, 2000];
const HOW_MANY = 5;
const BALL = 116;
/** Where the balls live: the floor they land on, and how high they go. */
const FLOOR = DESIGN.height - 118;
const RISE = { min: 210, max: 330 };
const LANE = { left: RAIL_EDGE + 64, right: DESIGN.width - 110 };

export default class Bounce extends Phaser.Scene {
  constructor() {
    super('Bounce');
    /** @type {string[]} */
    this.pool = [];
    this.streak = 0;
    /** @type {string|null} */
    this.target = null;
    /** @type {Phaser.GameObjects.Container[]} */
    this.balls = [];
    this.locked = false;
  }

  preload() {
    queueBackdrop(this);
  }

  create() {
    this.pool = [...lettersById.keys()].filter((id) => letterGlyph(id));
    this.streak = 0;
    this.balls = [];

    this.stage = addStage(this, {
      instruction: 'catch-bounce',
      roman: 'Catch it bouncing',
    });
    this.banner = this.stage.banner;
    this.rail = this.stage.rail;

    this.fit = fitEmAlone(allLetterGlyphs('isolated'), BALL - 40, BALL - 46);
    this.promptLayer = this.add.container(RAIL_EDGE + 96, 212);

    this.newRound();
    this.events.once('shutdown', () => this.time.removeAllEvents());
  }

  // ------------------------------------------------------------------ round

  newRound() {
    this.locked = false;
    for (const ball of [...this.balls]) this.remove(ball);

    const pool = this.pool.filter((id) => id !== this.target);
    this.target = Phaser.Utils.Array.GetRandom(pool.length ? pool : this.pool);

    this.banner?.setInstruction('catch-bounce', 'Catch it bouncing');
    this.buildPrompt();
    this.updateStreak();
    sayLetter(this.target, { word: false });

    // Its own family first, so the choice is between letters that differ by a
    // dot rather than by silhouette.
    const siblings = Phaser.Utils.Array.Shuffle(
      shapeFamilySiblings(this.target).filter((id) => letterGlyph(id))
    );
    const rest = Phaser.Utils.Array.Shuffle(
      this.pool.filter((id) => id !== this.target && !siblings.includes(id))
    );
    const others = [...siblings, ...rest].slice(0, HOW_MANY - 1);
    const order = Phaser.Utils.Array.Shuffle([this.target, ...others]);

    const span = (LANE.right - LANE.left) / order.length;
    order.forEach((id, i) => {
      this.launch(id, LANE.left + span * (i + 0.5), i);
    });
  }

  buildPrompt() {
    this.promptLayer.removeAll(true);
    const badge = makeButton(this, {
      x: 0,
      y: 0,
      width: 152,
      height: 132,
      color: familyColor(lettersById.get(this.target).shapeFamily),
      onTap: () => sayLetter(this.target, { word: false }),
    });
    const fit = fitEmAlone(allLetterGlyphs('isolated'), 100, 84);
    badge.add(
      addGlyph(
        this,
        0,
        -6,
        `bounce-prompt:em${Math.round(fit.em)}:${this.target}`,
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

  // ----------------------------------------------------------------- balls

  launch(letterId, x, index) {
    const colour = familyColor(lettersById.get(letterId).shapeFamily);
    const ball = this.add.container(x, FLOOR);
    ball.letterId = letterId;

    const skin = this.add.graphics();
    skin.fillStyle(COLORS.shadow, 0.18);
    skin.fillCircle(0, 8, BALL / 2);
    skin.fillStyle(colour, 1);
    skin.fillCircle(0, 0, BALL / 2);
    skin.fillStyle(0xffffff, 0.4);
    skin.fillEllipse(-BALL / 5, -BALL / 4, BALL / 3.4, BALL / 5);
    ball.add(skin);

    ball.add(
      addGlyph(
        this,
        0,
        0,
        `bounce:em${Math.round(this.fit.em)}:${letterId}`,
        letterGlyph(letterId, 'isolated'),
        { em: this.fit.em, color: COLORS.onColor }
      )
    );

    ball.setSize(BALL, BALL);
    ball.setInteractive({ useHandCursor: true });
    ball.on('pointerup', () => this.catchBall(ball));

    this.balls.push(ball);
    this.bounce(ball, index);
    return ball;
  }

  /**
   * One endless bounce.
   *
   * Quad easing both ways is what makes it read as gravity: slowest at the top,
   * fastest at the floor. A linear yoyo looks like a lift.
   *
   * Each ball gets its own height and a starting delay, so the row never falls
   * into step — five balls bouncing together is a rhythm to tap along with
   * rather than a thing to look at.
   */
  bounce(ball, index) {
    const period = BOUNCE_MS[Math.min(this.streak, BOUNCE_MS.length - 1)];
    ball.trip = this.tweens.add({
      targets: ball,
      y: FLOOR - Phaser.Math.Between(RISE.min, RISE.max),
      duration: period / 2,
      delay: index * 260,
      yoyo: true,
      repeat: -1,
      ease: 'Quad.easeOut',
      // A squash as it lands, which is most of what sells a bounce.
      onRepeat: () => {
        if (!ball.active) return;
        this.tweens.add({
          targets: ball,
          scaleX: 1.16,
          scaleY: 0.84,
          duration: 90,
          yoyo: true,
          ease: 'Quad.easeOut',
        });
      },
    });
  }

  remove(ball) {
    ball.trip?.stop();
    this.tweens.killTweensOf(ball);
    this.balls = this.balls.filter((b) => b !== ball);
    ball.destroy();
  }

  catchBall(ball) {
    if (this.locked || !ball.active) return;

    if (ball.letterId !== this.target) {
      wrongAnswer();
      this.rail?.wonder();
      // It keeps bouncing. Nothing is removed, so the right one is never harder
      // to find because of a wrong guess.
      this.tweens.add({
        targets: ball,
        angle: 12,
        duration: 80,
        yoyo: true,
        repeat: 2,
        ease: 'Sine.easeInOut',
      });
      this.streak = 0;
      this.updateStreak();
      return;
    }

    this.locked = true;
    rightAnswer();
    sfx.pop();
    this.streak++;
    popPuff(this, ball.x, ball.y, familyColor(lettersById.get(this.target).shapeFamily));
    sparkleBurst(this, ball.x, ball.y, { count: 26 });
    this.rail?.cheer();
    this.remove(ball);
    this.updateStreak();
    sayLetter(this.target);

    if (this.streak % 5 === 0) {
      milestone();
      wellDone(this, this.stage);
    }

    for (const other of this.balls) {
      this.tweens.add({ targets: other, alpha: 0, duration: 420 });
    }
    this.time.delayedCall(1000, () => {
      if (this.scene.isActive()) this.newRound();
    });
  }
}
